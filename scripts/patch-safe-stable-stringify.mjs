/**
 * pnpm postinstall: ESM faces for CommonJS packages that Vite dev serves raw.
 *
 * Vite dev pre-bundles deps listed in optimizeDeps.include; @powerhousedao's
 * browser bundles (`document-model-*.js`, the connect chunks) are served
 * *raw* instead, so their bare imports of transitive CJS packages resolve to
 * the untransformed CommonJS entries. The browser can't import named
 * bindings from raw CJS, and one failing import kills the whole
 * dynamic-import chunk: every Connect document route hangs on "Loading
 * editor" forever. Failures observed on vite 8.0.14:
 *
 *   safe-stable-stringify        → no export named 'stringify'
 *   void-elements                → no export named 'default'   (html-parse-stringify)
 *   use-sync-external-store/shim → no export named 'useSyncExternalStore' (react-i18next)
 *
 * For each affected file, the original CJS is copied to `<file>.cjs`
 * (untouched — Node `require` resolves through the package's
 * main/exports/require-condition and keeps landing on CommonJS) and the
 * entry becomes a pure-ESM shim:
 *
 *   - `import { X } from "…/x.js"`   (no default import, e.g. safe-stable-stringify):
 *     a static re-export of the dev implementation — rollup/esbuild resolve
 *     named imports statically, and Vite dev serves the .js shim (transform
 *     with interop) while the .cjs stays raw, so the shim's own static
 *     import is browser-safe.
 *   - `import d from "…/x.js"` (default import, e.g. void-elements / the
 *     use-sync dispatchers): a runtime branch — browser (a runtime
 *     `process.env.NODE_ENV`, which Vite dev defines) dynamically imports
 *     the `.cjs` (interop default == its module.exports, whose
 *     `process.env.NODE_ENV` picks the dev build); a runtime `require`
 *     (Node, which never reaches this file through the package's
 *     conditions) takes the `.cjs` synchronously; plain bundlers without a
 *     runtime process statically re-export the dev implementation.
 *
 * The patches live under node_modules/.pnpm, so they must be re-applied on
 * every install — hence postinstall. `--restore` rewrites the pristine CJS
 * back from the `.cjs` copies.
 *
 * Idempotent; repairs half-applied states; no-ops when packages are absent.
 */
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const store = join(process.cwd(), "node_modules", ".pnpm");

const SHIM_MARK = "Vite dev-interop shim";
const restore = process.argv.includes("--restore");

/** Copy `node_modules/.pnpm/<name>@*` package dirs for a package name. */
function pkgCopies(name) {
  const found = [];
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

/**
 * Files to give an ESM face. `tail` re-exports the implementation —
 * `__cjsModule.exports` is the CJS `module.exports` value (or, for static
 * re-exports of a plain implementation file, the module namespace) — under
 * the names ESM consumers import. `mode` picks the shim shape above:
 * "static" when consumers only name-import.
 */
/** Named ESM re-exports after inlining an implementation whose
 * `exports.name = ...` assignments were kept (tail references `exports`). */
const NAMED = (names) => names.map((n) => "export const " + n + " = exports." + n + ";\n").join("");

const FACES = [
  {
    // @powerhousedao shared bundle imports { stringify } (and CJS consumers
    // import default). Its CJS is a single implementation file, not a
    // dev/prod dispatcher: re-export it directly.
    name: "safe-stable-stringify",
    file: "index.js",
    mode: "static",
    tail:
      "export const configure = __cjsModule.exports.configure;\n" +
      "export const stringify = __cjsModule.exports;\n" +
      "export default __cjsModule.exports;\n",
  },
  {
    // html-parse-stringify (via react-i18next) default-imports this bare
    // `module.exports = {…}` table.
    name: "void-elements",
    file: "index.js",
    mode: "runtime",
    tail: "export default __cjsModule.exports;\n",
  },
  {
    // react-i18next's ESM build named-imports the hook.
    name: "use-sync-external-store",
    file: "shim/index.js",
    mode: "static",
    tail: NAMED(["useSyncExternalStore"]),
  },
  {
    // The other subpath entries; zustand imports the root entry by name
    // through its own pre-bundled build, these cover any raw ESM consumer.
    name: "use-sync-external-store",
    file: "index.js",
    mode: "static",
    tail: NAMED(["useSyncExternalStore"]),
  },
  {
    name: "use-sync-external-store",
    file: "with-selector.js",
    mode: "static",
    tail: NAMED(["useSyncExternalStoreWithSelector"]),
  },
  {
    name: "use-sync-external-store",
    file: "shim/with-selector.js",
    mode: "static",
    tail: NAMED(["useSyncExternalStoreWithSelector"]),
  },
];

/**
 * The dev implementation a CJS dispatcher selects — the `require(…)` from
 * its dev branch: `if (process.env.NODE_ENV === 'production') { … } else {
 * module.exports = require('…development.js') }`. (Matching the dev branch
 * specifically: the production line appears first in the file.)
 */
function devImplOf(cur, fileDir) {
  const branches = [...cur.matchAll(/else\s*\{[^}]*?require\(\s*['"]([^'"]*?\.js)['"]/gs)];
  const rel = branches.length
    ? branches[0][1].replace(/^\.\//, "")
    : (cur.match(/require\(\s*['"]([^'"]*?\.js)['"]/) ?? [])[1]?.replace(/^\.\//, "");
  if (!rel) return null;
  return existsSync(join(fileDir, rel)) ? rel : null;
}

function shimSource(stem, face, devRel, devSource) {
  const devImport = devRel ? "./" + devRel.replace(/\\/g, "/") : "./" + stem + ".cjs";
  const header =
    "// " + SHIM_MARK + " (stackfolio postinstall): ESM view over the\n" +
    "// CommonJS implementation — Vite dev serves .cjs raw, so ESM consumers\n" +
    "// import through this shim instead.\n";
  if (face.mode === "static") {
    // Inline the dev implementation instead of importing it: Vite dev
    // serves .js/.cjs raw without CJS interop, so an import would fail
    // exactly like the original did. The dev build's guards
    // (`"production" !== process.env.NODE_ENV && (function(){…})()`)
    // become `true &&` — Vite dev defines process.env.NODE_ENV, and the
    // inlined code runs the dev path. The dispatcher and production build
    // remain in ./index.cjs for require() consumers.
    return esmInline(devSource ?? "", face.tail, { keepExports: true });
  }
  return (
    header +
    "// Runtime dispatch: in a browser (Vite dev defines\n" +
    "// process.env.NODE_ENV) the .cjs is dynamically imported — its\n" +
    "// interop default is module.exports, and its own NODE_ENV check picks\n" +
    "// the dev build; `module` is undefined in ESM so the CommonJS wiring\n" +
    "// is inert there. Under Node the require() branch runs synchronously;\n" +
    "// bundlers without a runtime process take the static dev import.\n" +
    "let __cjsModule;\n" +
    'if (typeof process !== "undefined" && process.env && process.env.NODE_ENV) {\n' +
    '  __cjsModule = { exports: (await import("./' + stem + '.cjs")).default };\n' +
    "} else if (typeof require === \"function\") {\n" +
    '  __cjsModule = { exports: require("./' + stem + '.cjs") };\n' +
    "} else {\n" +
    '  __cjsModule = await import("' + devImport + '");\n' +
    "}\n" +
    face.tail
  );
}

for (const face of FACES) {
  for (const dir of pkgCopies(face.name)) {
    const file = join(dir, face.file);
    const cjs = file + ".cjs";
    if (!existsSync(file)) continue;

    if (restore) {
      if (existsSync(cjs)) {
        try {
          chmodSync(dirname(file), 0o755);
          writeFileSync(file, readFileSync(cjs, "utf8"));
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
    if (cur.includes(SHIM_MARK)) continue; // current shim already installed
    if (cur.includes("__cjsModule") && existsSync(cjs)) {
      cur = readFileSync(cjs, "utf8"); // repair: half-applied older shim
    }
    if (!/\bmodule\.exports\b/.test(cur) && existsSync(cjs)) {
      cur = readFileSync(cjs, "utf8");
    }
    if (!/\bmodule\.exports\b/.test(cur)) continue; // not a CJS dispatcher

    const devRel = devImplOf(cur, dirname(file));

    try {
      chmodSync(dir, 0o755);
      chmodSync(file, 0o644);
      writeFileSync(cjs, cur);
      const stem = face.file.split("/").pop().replace(/\.js$/, "");
      let out;
      if (face.mode === "static") {
        // Inline the browser build (dev implementation, or the entry
        // itself for single-file CJS): a static import would hit raw CJS.
        const devSource = devRel ? readFileSync(join(dirname(file), devRel), "utf8") : cur;
        out = shimSource(stem, face, devRel ? "./" + devRel : null, devSource).replaceAll("././", "./");
      } else {
        out = shimSource(stem, face, devRel ? "./" + devRel : null, cur).replaceAll("././", "./");
      }
      writeFileSync(file, out);
      console.log(`[stackfolio] ESM face for ${face.name} ${face.file}: ${dir}`);
    } catch (err) {
      console.warn(`[stackfolio] ${face.name} ${face.file} failed in ${dir}: ${err.message}`);
    }
  }
}

/**
 * ESM module from a single-file CJS implementation: the source verbatim,
 * minus the CommonJS export wiring (`module.exports = …`,
 * `exports.name = …` assignment lines and the `@ts-expect-error` directives
 * attached to them, plus any UMD footer), plus `tail`'s export statements.
 */
function esmInline(cjsSource, tail, opts = {}) {
  const lines = cjsSource.split("\n");
  const out = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (/^\s*module\.exports(?:\.\w+)?\s*=/.test(line)) continue;
    if (!opts.keepExports && /^\s*exports(?:\.\w+)?\s*=/.test(line)) continue;
    if (/\/\*\* @preserve/.test(line)) continue; // UMD footer
    if (
      /^\/\/ @ts-expect-error/.test(line) &&
      /^\s*(?:module\.)?exports\b/.test(lines[idx + 1] ?? "")
    ) {
      continue; // directive for an elided exports line
    }
    out.push(line);
  }
  return (
    "// " + SHIM_MARK + " (stackfolio postinstall): ESM build of the\n" +
    "// CommonJS implementation — the source above is verbatim, with its\n" +
    "// export wiring replaced by ESM exports. Vite dev serves raw .cjs\n" +
    "// without interop, so ESM consumers (raw-served @powerhousedao\n" +
    "// bundles) import this file instead; require() consumers keep the\n" +
    "// original in ./index.cjs.\n" +
    (opts.keepExports ? "const exports = {};\n" : "") +
    out.join("\n").trimEnd() + "\n" + tail
  );
}

if (restore) process.exit(0);

// package.json faces: ESM consumers must resolve through the shim; Node
// keeps taking the CJS via main/require/default conditions. Only root
// index.js entries with condition-style `exports` get this rewrite —
// packages whose `exports` are subpath keys (use-sync-external-store) must
// stay untouched: mixing key styles is an invalid package config, and their
// raw `require` specifiers already resolve to the untouched CJS there.
for (const name of new Set(FACES.filter((f) => f.file === "index.js").map((f) => f.name))) {
  for (const dir of pkgCopies(name)) {
    const pjPath = join(dir, "package.json");
    try {
      const pj = JSON.parse(readFileSync(pjPath, "utf8"));
      if (pj.main === "./index.cjs") continue;
      const exp = pj.exports;
      const styleKeys =
        exp && typeof exp === "object" && !Array.isArray(exp) &&
        Object.keys(exp).every((k) => !k.startsWith("."));
      if (exp && typeof exp === "object" && !Array.isArray(exp) && !styleKeys) continue;
      chmodSync(pjPath, 0o644);
      pj.exports = {
        ...(exp && typeof exp === "object" ? exp : {}),
        import: "./index.js",
        require: "./index.cjs",
        default: "./index.cjs",
        browser: "./index.js",
      };
      pj.main = "./index.cjs";
      pj.module = "./index.js";
      writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");
    } catch {
      /* package absent */
    }
  }
}
