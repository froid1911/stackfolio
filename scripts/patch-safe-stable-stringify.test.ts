/**
 * pnpm hard-links identical files from its global content-addressed store
 * into every package copy (and every project) that shares them. A patch
 * that writes in place writes through to all of them: another version's
 * copy gets the shim without its `.cjs`, and the global store is edited.
 */
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "patch-safe-stable-stringify.mjs");
const PRISTINE = "'use strict';\nmodule.exports = { useSyncExternalStore: function () {} };\n";
const PKG = (version: string) => JSON.stringify({ name: "use-sync-external-store", version }) + "\n";

let root: string;

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A pnpm layout whose two copies link one "global store" entry file. */
function layout(): { store: string; global: string; copies: string[] } {
  root = mkdtempSync(join(tmpdir(), "uses-patch-"));
  const store = join(root, ".pnpm");
  const global = join(root, "global-store", "shim-index.js");
  mkdirSync(dirname(global), { recursive: true });
  writeFileSync(global, PRISTINE);
  const copies = ["1.4.0", "1.7.0"].map((version) => {
    const dir = join(store, `use-sync-external-store@${version}_react@19`, "node_modules", "use-sync-external-store");
    mkdirSync(join(dir, "shim"), { recursive: true });
    linkSync(global, join(dir, "shim", "index.js"));
    writeFileSync(join(dir, "package.json"), PKG(version));
    return dir;
  });
  return { store, global, copies };
}

const run = (store: string, ...args: string[]) =>
  execFileSync("node", [SCRIPT, ...args], {
    env: { ...process.env, STACKFOLIO_MODULE_STORE: store },
    stdio: "pipe",
  });

describe("patch-safe-stable-stringify", () => {
  it("never writes through a hard link into the shared store", () => {
    const { store, global } = layout();
    run(store);
    expect(readFileSync(global, "utf8")).toBe(PRISTINE);
  });

  it("gives every copy its own shim and its own pristine .cjs", () => {
    const { store, copies } = layout();
    run(store);
    for (const dir of copies) {
      expect(readFileSync(join(dir, "shim", "index.js"), "utf8")).toContain("Vite dev-interop shim");
      expect(readFileSync(join(dir, "shim", "index.js.cjs"), "utf8")).toBe(PRISTINE);
    }
  });

  it("routes require() only to .cjs files that exist", () => {
    const { store, copies } = layout();
    run(store);
    for (const dir of copies) {
      const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        exports: Record<string, string | { require?: string }>;
      };
      for (const target of Object.values(pj.exports)) {
        if (typeof target === "object" && target.require) {
          expect(existsSync(join(dir, target.require)), target.require).toBe(true);
        }
      }
    }
  });

  it("recovers a copy left shimmed without its .cjs by an earlier write-through", () => {
    const { store, global, copies } = layout();
    // The broken state found on disk: an in-place patch of 1.4.0 wrote the
    // shim through the shared inode into 1.7.0, and the .cjs only into 1.4.0.
    const [first, second] = copies as [string, string];
    writeFileSync(join(first, "shim", "index.js.cjs"), PRISTINE);
    writeFileSync(global, "// Vite dev-interop shim v2 (stale write-through)\n");
    run(store);
    expect(readFileSync(join(second, "shim", "index.js.cjs"), "utf8")).toBe(PRISTINE);
    expect(readFileSync(join(second, "shim", "index.js"), "utf8")).toContain("useSyncExternalStore");
  });
});
