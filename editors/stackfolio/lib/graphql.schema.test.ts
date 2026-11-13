/**
 * The client's portfolioApi queries against the subgraph's own schema. A
 * field the server does not define fails the whole request with a 400, and
 * the hook quietly answers no data — the Hyperliquid query did that on every
 * P&L load. This catches the drift at test time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildASTSchema, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { schema } from "../../../subgraphs/portfolio-api/schema.js";

const source = readFileSync(join(import.meta.dirname, "graphql.ts"), "utf8");
// Selection fragments the queries splice in: `const NAME = \`...\``.
const fragments = new Map(
  [...source.matchAll(/const ([A-Z_]+) = `([^`]*)`/g)].map((m) => [m[1], m[2]]),
);
const queries = [...source.matchAll(/`((?:query|mutation)\b[^`]*portfolioApi[^`]*)`/g)].map(
  (m) => m[1].replace(/\$\{([A-Z_]+)\}/g, (_, name: string) => fragments.get(name) ?? ""),
);
const server = buildASTSchema(schema);

describe("portfolioApi client queries", () => {
  it("finds the queries it checks", () => {
    expect(queries.length).toBeGreaterThanOrEqual(20);
  });

  it.each(queries.map((q) => [q.slice(0, 90), q]))("%s… matches the schema", (_, query) => {
    const errors = validate(server, parse(query)).map((e) => e.message);
    expect(errors).toEqual([]);
  });
});
