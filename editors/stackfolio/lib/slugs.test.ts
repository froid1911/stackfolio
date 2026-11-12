import { describe, expect, it } from "vitest";
import { resolveNodeSlug, slug, slugMatches } from "./slugs.js";

describe("slugs", () => {
  it("is idempotent", () => {
    const id = "sB90IcnFT_tchQameoNMsMU23wlyJu4Uh3dU8gApfe4";
    expect(slug(slug(id))).toBe(slug(id));
    expect(slug("0x1aD3:log:12")).toBe(slug("0x1aD3:log:12"));
  });

  it("lowercases without folding structure", () => {
    expect(slug("0x1aD3:log:12")).toBe("0x1ad3:log:12");
    // A candidate's separators are punctuation a URL dislikes; the match
    // ignores them, but two ids never collide over their absence.
    expect(slugMatches("a-bc", "a:b:c")).toBe(false);
    expect(slugMatches("abc", "abd")).toBe(false);
    expect(slugMatches("0x1AD3:log:12", slug("0x1ad3:log:12"))).toBe(true);
    // A pasted slug matches its own id, and punctuation in the candidate
    // is ignored when the target carries it.
    expect(slugMatches("0x1aD3:log:12", "0x1ad3-log-12")).toBe(true);
    // Asymmetric only across different lengths; the same position maps
    // separator-to-separator both ways, which is what makes a pasted URL
    // safe for either id.
    expect(slugMatches("0x1aD3-log-12", "0x1ad3:log:12")).toBe(true);
    expect(slugMatches("a-bc", "a:bc")).toBe(true);
    expect(slugMatches("a-bc", "abc")).toBe(false);
    expect(slugMatches("abc", "a:bc")).toBe(false);
  });

  it("resolves a candidate against live ids", () => {
    const nodes = [{ id: "aB1" }, { id: "sB90IcnFT_tchQameoNMsMU23wlyJu4Uh3dU8gApfe4" }];
    expect(resolveNodeSlug(nodes, "ab1")).toBe("aB1");
    expect(
      resolveNodeSlug(nodes, "sB90IcnFT_tchQameoNMsMU23wlyJu4Uh3dU8gApfe4"),
    ).toBe("sB90IcnFT_tchQameoNMsMU23wlyJu4Uh3dU8gApfe4");
    expect(resolveNodeSlug(nodes, "nope")).toBeUndefined();
  });

  it("keeps the slug of an opaque id self-matching", () => {
    const id = "22rEHNiqrM-4NFNnfwgJLPlA5MSmjPGcNMe8HhFbWfw";
    expect(slugMatches(id, slug(id))).toBe(true);
  });
});
