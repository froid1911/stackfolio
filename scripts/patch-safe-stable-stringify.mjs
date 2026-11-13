/**
 * pnpm postinstall: ESM faces for CommonJS packages that Vite dev serves raw.
 *
 * Vite dev pre-bundles deps listed in optimizeDeps.include; @powerhousedao's
 * browser bundles (`document-model-*.js`, the connect chunks) are served
 * *raw* instead, so their bare imports of transitive CJS packages resolve to
 * the untransformed CommonJS entries — and raw CommonJS is unloadable in
 * the browser: `exports.x =` assignments throw a missing-binding error for
 * named imports ("does not provide an export named …"), a bare `module`
 * reference throws outright, and a bare `process.env.NODE_ENV` throws
 * ReferenceError. One failing import kills the whole dynamic-import chunk:
 * every Connect document route hangs on "Loading editor" forever. Packages
 * affected on vite 8.0.14 (all reached through the raw-served vendor
 * bundles): safe-stable-stringify (document-model), void-elements
 * (html-parse-stringify via react-i18next) and use-sync-external-store
 * (react-i18next; wagmi/zustand reach the same files through
 * pre-bundled graphs, which is why only these paths break).
 *
 * Per entry file: the original CommonJS is copied to `<file>.cjs`
 * (untouched — Node `require` resolves through the package's
 * main/exports/require conditions and keeps landing on it; Vite dev serves
 * `.cjs` raw, so it never executes in the browser), and the entry becomes a
 * pure-ESM shim:
 *
 *   - browser: the dev implementation INLINED verbatim — a static import
 *     of any raw file would hit the same wall. The body runs inside a
 *     CommonJS wrapper (module/exports/process are its own bindings, the
 *     environment a parameter), so nothing leaks into the ESM scope and
 *     no `process.env` reference survives for the browser to trip on.
 *     `require(…)` inside the implementation is mapped to ESM sources:
 *     `react` via Vite's import map (the app's own instance), own-package
 *     subpaths via this package's ESM faces. The wrapper returns the
 *     CommonJS `module.exports` value (a captured entry-point assignment
 *     wins over the exports bag), and the tail re-exports from it. The
 *     runtime test and the dispatcher call reference `require`/`process`
 *     only through computed globalThis keys: Rollup (Vite's dep
 *     optimizer) rewrites bare occurrences of those identifiers in ESM
 *     files, even in dead branches.
 *   - Node: the untouched dispatcher — the shim resolves its `<file>.cjs`
 *     sibling at runtime (`globalThis.require` on an absolute path, inert
 *     to bundlers) — dev/prod selection intact. Node ESM (no `require`)
 *     and bundlers take the wrapper branch.
 *
 * The patches live under node_modules/.pnpm, so they must be re-applied on
 * every install — hence postinstall. `--restore` rewrites the pristine CJS
 * back from the `.cjs` copies.
 *
 * Idempotent; repairs half-applied states; no-ops when packages are absent.
 */
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

// Overridable for tests: point the faces at a patch dir or a probe tree.
const store = process.env.STACKFOLIO_MODULE_STORE ?? join(process.cwd(), "node_modules", ".pnpm");

const SHIM_MARK = "Vite dev-interop shim v2";

/**
 * pnpm hard-links identical files from its global store into every copy
 * and every project that shares them; an in-place write edits all of them
 * (another version's copy gets a shim without its `.cjs`, and the global
 * store is changed). Every write here replaces the path with a new inode.
 */
function writeOwn(path, content) {
  const tmp = path + ".stackfolio-tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

const inodeOf = (path) => {
  try {
    return statSync(path).ino;
  } catch {
    return null;
  }
};
const restore = process.argv.includes("--restore");

/** Package dirs for a package name: pnpm store layout (`<name>@*` dirs)
 * or a flat root (`node_modules` whose direct children are packages). */
function pkgCopies(name) {
  const found = [];
  const flat = join(store, name);
  if (existsSync(join(flat, "package.json"))) found.push(flat);
  let entries;
  try {
    entries = readdirSync(store, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith(name + "@")) continue;
    const p = join(store, ent.name, "node_modules", name);
    if (existsSync(join(p, "package.json"))) found.push(p);
  }
  return found;
}

/** Named ESM re-exports of an inlined implementation's `exports` bindings. */
const NAMED = (names) => names.map((n) => "export const " + n + " = exports." + n + ";\n").join("");

/**
 * Entry files that get an ESM face. `tail` re-exports the inlined
 * implementation (`exports` — the CJS `module.exports` value for
 * single-file implementations, or the bindings an IIFE build assigned).
 * `selfDeps` maps `require` specifiers the implementation uses to ESM
 * sources: bare specifiers (react — provided through Vite's import map)
 * and own-package subpaths (mapped to this package's ESM faces; the
 * CommonJS self-require would loop back to the dispatcher).
 */
const FACES = [
  {
    // @powerhousedao's document-model bundle imports { stringify }; the
    // entry is a single implementation file, no dev/prod dispatcher.
    name: "safe-stable-stringify",
    file: "index.js",
    tail:
      "export const configure = exports.configure;\n" +
      "export const stringify = exports.stringify;\n" +
      "export default exports;\n",
  },
  {
    // html-parse-stringify (via react-i18next) default-imports this bare
    // `module.exports = {…}` table. The inlined table is the `exports`
    // binding itself (module.exports wiring is stripped), hence the
    // prelude before re-exporting it as the default.
    name: "void-elements",
    file: "index.js",
    tail: "export default exports;\n",
  },
  {
    // react-i18next's ESM build named-imports the hook.
    name: "use-sync-external-store",
    file: "shim/index.js",
    selfDeps: [["react", "react"]],
    tail: NAMED(["useSyncExternalStore"]),
  },
  {
    // The root entry dispatches to the shim build (its browser entry);
    // wagmi's pre-bundled graph and any raw consumer resolve here.
    name: "use-sync-external-store",
    file: "index.js",
    selfDeps: [["react", "react"]],
    tail: NAMED(["useSyncExternalStore"]),
  },
  {
    name: "use-sync-external-store",
    file: "with-selector.js",
    selfDeps: [
      ["react", "react"],
      ["use-sync-external-store/shim", "./shim/index.js"],
    ],
    // zustand's ESM build default-imports this entry and reads
    // `.useSyncExternalStoreWithSelector`, as CJS interop would.
    tail: NAMED(["useSyncExternalStoreWithSelector"]) + "export default exports;\n",
  },
  {
    name: "use-sync-external-store",
    file: "shim/with-selector.js",
    selfDeps: [
      ["react", "react"],
      ["use-sync-external-store/shim", "./index.js"],
    ],
    // zustand's ESM build default-imports this entry and reads
    // `.useSyncExternalStoreWithSelector`, as CJS interop would.
    tail: NAMED(["useSyncExternalStoreWithSelector"]) + "export default exports;\n",
  },
];

const IDENT = (s) => "__dep_" + s.replace(/[^a-zA-Z0-9]/g, "_");

/**
 * The dev implementation a dispatcher selects: the require() from its
 * `else` (non-production) branch — `if (process.env.NODE_ENV ===
 * 'production') { … } else { module.exports = require('…development.js') }`.
 * (The dev branch specifically: production's require appears first.)
 * Null when the entry is itself the implementation (single-file CJS).
 */
function devImplOf(cur, fileDir) {
  const branches = [...cur.matchAll(/else\s*\{[^}]*?require\(\s*['"]([^'"]*?\.js)['"]/gs)];
  const rel = branches.length
    ? branches[0][1].replace(/^\.\//, "")
    : null;
  if (!rel) return null;
  return existsSync(join(fileDir, rel)) ? rel : null;
}

/**
 * The ESM shim for one entry file.
 *
 * `implSource`: the browser build — the dev implementation, or the entry
 * itself when the entry is the implementation. `stem`: basename without
 * .js, i.e. the `.cjs` sibling written beside the entry.
 *
 * `tail` references the inlined implementation's `exports`; the Node
 * branch rebinds the same tail to `__cjs.exports` (the dispatcher's).
 */
function shimSource(face, stem, implSource) {
  const deps = face.selfDeps ?? [];
  // The CommonJS implementation evaluates inside a CommonJS wrapper
  // function: `exports`, `require`, `process` and `module` become
  // parameters, so nothing leaks into the ESM module scope and nothing
  // the browser lacks is referenced free (Vite dev's global
  // `process.env.NODE_ENV` is shadowed — the implementation takes its
  // no-NODE_ENV path). The source goes in verbatim: ESM and CommonJS
  // share one grammar, so any parseable CJS body is valid here too.
  const lines = implSource.split("\n");
  const kept = [];

  /**
   * Does the `module.exports = <rhs>` assignment end on line `idx`?
   * A balanced single line, or a bracketed literal spanning lines whose
   * brackets close later. Returns the consumed extra-line count via
   * consume(); balanced() decides eligibility and caches the end line.
   */
  const rhsEnd = new Map();
  function balanced(rhs, ls, idx) {
    // String-aware bracket scan: quotes toggle string mode, so brackets
    // and braces inside string literals never affect the depth.
    let depth = 0;
    let str = null; // active quote char
    const scan = (line) => {
      let escaped = false;
      for (const ch of line) {
        if (str) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === str) str = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { str = ch; continue; }
        if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") depth--;
      }
    };
    scan(rhs);
    if (depth <= 0) {
      const closed = depth === 0;
      rhsEnd.set(idx, idx);
      return closed;
    }
    let j = idx + 1;
    for (; j < ls.length && depth > 0; j++) scan(ls[j]);
    if (depth !== 0) return false;
    rhsEnd.set(idx, j - 1);
    return true;
  }
  let capture = null; // entry-point value: `module.exports = <expr>` RHS
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (/^\s*(?:var|let|const)\s+__cjsEntry\b/.test(line)) continue; // repair
    const m = line.match(/^(\s*)module\.exports\s*=\s*(.+?);?\s*$/);
    if (m && balanced(m[2], lines, idx)) {
      // An entry point: `module.exports = <expr>`. Capture the value in a
      // binding; the wrapper assigns it to module.exports at the end, so
      // the tail reads the real CommonJS export (bag for IIFE builds,
      // replaced value for entry-point builds).
      capture = m[1] + "var __cjsEntry = ";
      kept.push(capture + m[2]); // the RHS keeps its own syntax (literal opener, or `;` for a reference)
      for (let j = idx + 1; j <= (rhsEnd.get(idx) ?? idx); j++) {
        kept.push(lines[j]);
        idx = j;
      }
      continue;
    }
    if (/^\s*module\.exports(?:\.\w+)?\s*=/.test(line)) continue;
    if (
      /^\/\/ @ts-expect-error/.test(line) &&
      /^\s*module\.exports\b/.test(lines[idx + 1] ?? "")
    ) {
      continue; // directive for an elided line
    }
    kept.push(/\brequire\(/.test(line) ? line.replace(/\brequire\(/g, "__cjsRequire(") : line);
  }
  const implBody = kept.join("\n");
  // Rollup (Vite's dep optimizer) rewrites a bare `require` inside an
  // ESM file to its own `__require` shim, which throws. The runtime
  // test and the call must therefore not contain those identifiers
  // textually: an indirect reference through a computed key is inert to
  // both rewrites, and the `module` test is textually absent anyway
  // (ESM has no `module`, real Node CJS always provides it).
  const REQ = "req" + "uire"; // inert: no literal call-site token
  const REQ_GLOB = 'globalThis["' + REQ + '"]';
  const PROCESS = "process"; // inert: `process.env` never appears
  const NODE_COND =
    "typeof globalThis[\x22" + REQ + "\x22] === \x22function\x22 &&" +
    " typeof globalThis[\x22" + PROCESS + "\x22] !== \x22undefined\x22 &&" +
    " !!globalThis[\x22" + PROCESS + "\x22].env &&" +
    " globalThis[\x22" + PROCESS + "\x22].env.NODE_ENV !== \x22production\x22";
  return (
    "// " + SHIM_MARK + " (stackfolio postinstall): ESM view over the\n" +
    "// CommonJS implementation. Vite dev serves raw .js/.cjs without CJS\n" +
    "// interop - bare `module`/`exports`/`process` throw in the browser -\n" +
    "// so the implementation runs here inside a CommonJS wrapper (its\n" +
    "// globals are parameters; require maps to ESM sources) and its\n" +
    "// interface is re-exported. require() consumers (Node) take the\n" +
    "// untouched dispatcher in ./" + stem + ".cjs instead.\n" +
    (deps.length
      ? deps.map(([, src]) => `import * as ${IDENT(src)} from ${JSON.stringify(src)};`).join("\n") + "\n"
      : "") +
    // `__cjs` is declared once; both branches assign it. A second
    // `const __cjs` inside the else-block would shadow this binding and
    // leave it forever undefined.
    "let __cjs;\n" +
    'if (' + NODE_COND + ') {\n' +
    "  // Node CJS (require + module exist): the original dispatcher,\n" +
    "  // dev/prod selection intact. Bundlers and ESM take the wrapper.\n" +
    "  // Load the sibling dispatcher by absolute path; a static\n" +
    "  // bundle-time specifier would be resolved (and fail) by bundlers,\n" +
    "  // and a .cjs file cannot be import()ed as ESM.\n" +
    "  __cjs = " + REQ_GLOB + ".call(null, new URL(\"./" +
      face.file.split("/").pop() +
      '.cjs", import.meta.url).pathname);\n' +
"} else {\n" +
    "  // Browser / bundlers without a CommonJS runtime.\n" +
    "  const __cjsRequire = (id) => {\n" +
    "    const provided = {\n" +
    (deps.length
      ? deps.map(([spec, src]) => `      ${JSON.stringify(spec)}: ${IDENT(src)},`).join("\n") + "\n"
      : "") +
    "    };\n" +
    '    const m = provided[id];\n' +
    '    if (!m) throw new Error("[stackfolio shim] unexpected require: " + id);\n' +
    "    return m;\n" +
    "  };\n" +
    "  const __module = { exports: {} };\n" +
    "  // A fake environment: React builds read `process.env.NODE_ENV` at\n" +
    "  // the top level; development builds are the interop default.\n" +
    "  const processEnvShim = { env: {} };\n" +
    "  __cjs = ((process = {}, __cjsRequire) => {\n" +
    "    const module = __module;\n" +
    "    const exports = module.exports;\n" +
    "    " + implBody.replace(/\n/g, "\n    ") + "\n" +
    // An entry-point body assigns module.exports; capture its value back
    // onto __module.exports so the tail reads the real module.exports.
    // IIFE builds mutate the bag, which IS __module.exports.
    (capture ? "    module.exports = __cjsEntry;\n" : "") +
    "    return __module.exports;\n" +
    "  })(processEnvShim, __cjsRequire);\n" +
    "}\n" +
    // The exports live in `__cjs` directly (the wrapper's return value).
    // Binding them through `__cjs.exports` from inside an if/else block
    // hits the TDZ rule for let/const in blocks (ECMA-262 10.2.1.16):
    // the block's const declarations defer binding instantiation to the
    // end of the block, so reading `__cjs` mid-block throws — Node even
    // reports `void 0 !== X` true for a dead binding. One binding, read
    // after the branches join, sidesteps it entirely.
    face.tail
      .replace(/export const (\w+) = exports\.\1;/g, "export const $1 = __cjs.$1;")
      .replace(/export default exports;/g, "export default __cjs;")
      .replace(/export const (\w+) = exports;/g, "export const $1 = __cjs;")
  );
}

// Files sharing an inode had byte-identical pristine content, so a copy
// shimmed by an earlier write-through (shim present, `.cjs` missing) takes
// its pristine CommonJS from any copy of the same inode that saved one.
// Collected before any write gives a copy its own inode.
const pristineByInode = new Map();
for (const face of FACES) {
  for (const dir of pkgCopies(face.name)) {
    const file = join(dir, face.file);
    const ino = inodeOf(file);
    if (ino !== null && existsSync(file + ".cjs")) pristineByInode.set(ino, file + ".cjs");
  }
}

for (const face of FACES) {
  for (const dir of pkgCopies(face.name)) {
    const file = join(dir, face.file);
    const cjs = file + ".cjs";
    if (!existsSync(file)) continue;
    const orphanSource = existsSync(cjs) ? null : pristineByInode.get(inodeOf(file));

    if (restore) {
      if (existsSync(cjs)) {
        try {
          chmodSync(dirname(file), 0o755);
          writeOwn(file, readFileSync(cjs, "utf8"));
          console.log(`[stackfolio] restored ${face.name} ${face.file}: ${dir}`);
        } catch {
          /* read-only leftover; skip */
        }
      }
      continue;
    }

    let cur;
    try {
      cur = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Mark-versioned repair: an entry carrying an older shim mark is
    // stale (the generator moved on) — restore the saved CommonJS and
    // re-patch from pristine, whatever else the entry looks like.
    if (cur.includes(SHIM_MARK)) {
      if (!orphanSource) continue; // current shim already installed
      cur = readFileSync(orphanSource, "utf8"); // repair a write-through orphan
    }
    if (cur.includes("stackfolio postinstall")) {
      if (existsSync(cjs)) cur = readFileSync(cjs, "utf8");
      else continue; // stale shim whose pristine copy is gone; leave it
    }
    if (!/\bmodule\.exports\b/.test(cur) && existsSync(cjs)) {
      cur = readFileSync(cjs, "utf8"); // repair: entry edited past recognition
    }
    if (!/\bmodule\.exports\b/.test(cur)) continue; // not CommonJS entry wiring

    const devRel = devImplOf(cur, dirname(file));
    try {
      chmodSync(dir, 0o755);
      writeOwn(cjs, cur); // pristine dispatcher for require() consumers
      const stem = face.file.split("/").pop().replace(/\.js$/, "");
      const implSource = devRel ? readFileSync(join(dirname(file), devRel), "utf8") : cur;
      writeOwn(file, shimSource(face, stem, implSource));
      console.log(`[stackfolio] ESM face for ${face.name} ${face.file}: ${dir}`);
    } catch (err) {
      console.warn(`[stackfolio] ${face.name} ${face.file} failed in ${dir}: ${err.message}`);
    }
  }
}

if (restore) process.exit(0);

// package.json faces: ESM consumers must resolve through the shim; Node
// keeps taking the CommonJS via `require`. The rewrite must ALSO cover
// every subpath the patched files live at: turning an entry into ESM and
// adding an `exports` field hides subpaths that previously resolved
// implicitly (use-sync-external-store 1.4.0 has no `exports` at all, and
// wagmi imports `use-sync-external-store/shim/with-selector.js`).
// Conditions per subpath: `import`/`default`/`browser` → the shim,
// `require` → the pristine CommonJS saved beside it.
// `require` takes the saved CommonJS only where it exists; an unpatched
// entry is still CommonJS itself.
const conditionsFor = (dir, file) => ({
  import: "./" + file,
  require: "./" + file + (existsSync(join(dir, file + ".cjs")) ? ".cjs" : ""),
  default: "./" + file,
  browser: "./" + file,
});

const facesByName = new Map();
for (const face of FACES) {
  if (!facesByName.has(face.name)) facesByName.set(face.name, []);
  facesByName.get(face.name).push(face);
}

for (const [name, faces] of facesByName) {
  for (const dir of pkgCopies(name)) {
    const pjPath = join(dir, "package.json");
    try {
      const pj = JSON.parse(readFileSync(pjPath, "utf8"));
      const exp = pj.exports;
      const map = {};
      if (exp && typeof exp === "object" && !Array.isArray(exp)) {
        const conditionStyle = Object.keys(exp).every((k) => !k.startsWith("."));
        if (conditionStyle) map["."] = { ...exp };
        else Object.assign(map, exp);
      } else if (existsSync(join(dir, "index.js"))) {
        map["."] = conditionsFor(dir, "index.js");
      }
      for (const face of faces) {
        if (!existsSync(join(dir, face.file))) continue;
        const cond = conditionsFor(dir, face.file);
        const base = face.file.replace(/\.js$/, "");
        if (base === "index" || base === "") {
          map["."] = cond;
          continue;
        }
        const dirOf = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
        map["./" + base] = cond;
        map["./" + face.file] = cond;
        // `shim/index.js` also answers `use-sync-external-store/shim`.
        if (base.endsWith("/index")) map["./" + dirOf] = cond;
      }
      map["./package.json"] = "./package.json";

      if (JSON.stringify({ exports: pj.exports, main: pj.main, module: pj.module }) ===
          JSON.stringify({ exports: map, main: "./index.js", module: "./index.js" })) {
        continue;
      }
      pj.exports = map;
      pj.main = "./index.js";
      pj.module = "./index.js";
      writeOwn(pjPath, JSON.stringify(pj, null, 2) + "\n");
    } catch {
      /* package absent */
    }
  }
}
