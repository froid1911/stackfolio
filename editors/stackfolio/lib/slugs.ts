/**
 * URL slugs for detail params (events, assets, wallets, documents).
 *
 * Ids are case-sensitive base64url (or hex with `:`/`-` structure), and
 * a URL segment should read cleanly and never depend on case: the slug
 * of an id is its lowercase form — separators are PRESERVED, because two
 * ids differing only in separator placement (`a-bc` vs `a:bc`) must not
 * resolve to each other. A slug is one-way: views NEVER decode, they
 * match a candidate against the live ids with the same normalization, so
 * any reasonable spelling resolves (`resolveNodeSlug`, `slugMatches`).
 */

/** The canonical slug form of an id: lowercase; structure kept. */
export function slug(id: string): string {
  return id.toLowerCase();
}

/** True when `candidate` names `id`: case-insensitive, and separators in
 * the CANDIDATE (punctuation a URL dislikes) stand for any separator the
 * id carries; an id's own structure is never implied. */
export function slugMatches(id: string, candidate: string): boolean {
  const target = id.toLowerCase();
  const needle = candidate.toLowerCase();
  if (needle === target) return true;
  if (needle.length !== target.length) return false;
  // Same length: each character must match, and a separator in the
  // candidate stands for exactly one separator in the id — never for an
  // absent one, so ids differing only in structure never collide.
  for (let i = 0; i < needle.length; i += 1) {
    const c = needle[i];
    const t = target[i];
    if (c === t) continue;
    // A URL segment may not carry "/" cleanly; slugs of ids write "/" as
    // "-". So a hyphen in EITHER side stands for any separator the other
    // carries. Any other punctuation still matches only punctuation.
    if (c === "-" || t === "-") {
      if (/[-_.:/]/.test(c) && /[-_.:/]/.test(t)) continue;
      return false;
    }
    if (/[-_.:]/.test(c) && /[-_.:]/.test(t)) continue;
    return false;
  }
  return true;
}

/** The live id a URL candidate names, or undefined when it names none. */
export function resolveNodeSlug(
  nodes: readonly { id: string }[],
  candidate: string,
): string | undefined {
  return nodes.find((n) => slugMatches(n.id, candidate))?.id;
}
