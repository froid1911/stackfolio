import { createAction, Property } from "@powerhousedao/pieces-framework";
import { llamaKey } from "../llama.js";
import { globalState, toGlobalAction } from "../reactor.js";

/** Coins per DefiLlama "current" request: keeps the URL short. */
const PER_REQUEST = 80;

interface RegistryState {
  assets?: Array<{ identifier?: unknown }>;
}
interface PortfolioState {
  ignoredAssets?: string[];
  priceOverrides?: Array<{ asset: string }>;
}
interface PriceBookState {
  latest?: Array<{ asset: string }>;
}

/**
 * The registered tokens no price source knows: not priced by CoinGecko (the
 * price book's latest answers) and unknown to DefiLlama, which also prices
 * LP tokens and aTokens CoinGecko does not list. Tokens the portfolio
 * already ignores, or gives a price override, are never candidates - a
 * price override is how a user keeps a token the rule would drop.
 */
export function unlistedCandidates(
  registry: RegistryState,
  portfolio: PortfolioState,
  book: PriceBookState,
): string[] {
  const skip = new Set([
    ...(portfolio.ignoredAssets ?? []),
    ...(portfolio.priceOverrides ?? []).map((o) => o.asset),
    ...(book.latest ?? []).map((l) => l.asset),
  ]);
  return (registry.assets ?? [])
    .map((a) => a.identifier)
    .filter((id): id is string => typeof id === "string" && /\/erc20:0x[0-9a-fA-F]{40}$/.test(id))
    .filter((id) => !skip.has(id))
    .sort();
}

/**
 * Which of `identifiers` DefiLlama knows. A request that fails marks its
 * identifiers unknown-for-now: they are neither known nor ignorable.
 */
export async function llamaKnown(
  identifiers: string[],
  doFetch: typeof fetch,
): Promise<{ known: Set<string>; unanswered: Set<string> }> {
  const known = new Set<string>();
  const unanswered = new Set<string>();
  for (let at = 0; at < identifiers.length; at += PER_REQUEST) {
    const batch = identifiers.slice(at, at + PER_REQUEST);
    const keyed = batch.map((id) => [id, llamaKey(id)] as const).filter(([, key]) => key !== null);
    if (keyed.length === 0) continue;
    try {
      const response = await doFetch(
        `https://coins.llama.fi/prices/current/${keyed.map(([, key]) => key).join(",")}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { coins?: Record<string, unknown> };
      for (const [id, key] of keyed) if (body.coins?.[key as string]) known.add(id);
    } catch {
      for (const [id] of keyed) unanswered.add(id);
    }
  }
  return { known, unanswered };
}

export const ethereumIgnoreUnlistedTokensAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "ignore-unlisted-tokens",
  displayName: "Ignore Unlisted Tokens",
  description:
    "Ignore every registered token no price source knows - not priced by CoinGecko, unknown to DefiLlama: spam airdrops and address-poisoning fakes. A token with a price override is kept; ignoring is undone per token like any other.",
  props: {
    portfolioDocumentId: Property.ShortText({ displayName: "Portfolio document", required: true }),
    registryDocumentId: Property.ShortText({ displayName: "Asset registry document", required: true }),
    priceBookDocumentId: Property.ShortText({ displayName: "Price book document", required: true }),
  },
  async run(context) {
    const props = context.propsValue as typeof context.propsValue & { fetchImpl?: typeof fetch };
    const [portfolio, registry, book] = await Promise.all([
      context.reactor.get(props.portfolioDocumentId.trim()),
      context.reactor.get(props.registryDocumentId.trim()),
      context.reactor.get(props.priceBookDocumentId.trim()),
    ]);
    const candidates = unlistedCandidates(
      globalState<RegistryState>(registry),
      globalState<PortfolioState>(portfolio),
      globalState<PriceBookState>(book),
    );
    if (candidates.length === 0) return { checked: 0, ignored: 0 };
    const { known, unanswered } = await llamaKnown(candidates, props.fetchImpl ?? fetch);
    const unlisted = candidates.filter((id) => !known.has(id) && !unanswered.has(id));
    if (unlisted.length > 0) {
      await context.reactor.execute(
        props.portfolioDocumentId.trim(),
        "main",
        unlisted.map((asset) => toGlobalAction("SET_ASSET_IGNORED", { asset, ignored: true })),
      );
    }
    return { checked: candidates.length, ignored: unlisted.length, unanswered: unanswered.size };
  },
});
