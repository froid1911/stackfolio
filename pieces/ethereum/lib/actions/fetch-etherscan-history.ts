import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth, etherscanConfig } from "../auth.js";
import { authProps } from "../client.js";
import {
  createEtherscanClient,
  etherscanHeadBlock,
  EtherscanError,
  fetchWindow,
  type EtherscanRow,
} from "../etherscan.js";
import {
  mapEtherscanRows,
  type LedgerEventRow,
} from "../etherscan-rows.js";

/** The client surface the history walker needs - tests fake exactly this. */
export type HistoryClient = {
  call(params: Record<string, string | number>): Promise<unknown>;
};

/**
 * One confirmed window of an address's life: native txs, internal
 * traces, token transfers and approvals, mapped to ledger rows, with
 * the cursor for the next run. Plan-gated categories (free keys may not
 * see approvals) are named in `skippedCategories` and never fail the
 * run; a bad key or a sulking network does fail it, so the cursor only
 * ever advances over fully imported windows.
 */
export async function fetchEtherscanHistory(
  client: HistoryClient,
  opts: {
    address: string;
    startBlock: number;
    confirmations: number;
    windowBlocks: number;
    pageSize: number;
  },
): Promise<{
  rows: LedgerEventRow[];
  nextBlock: number;
  done: boolean;
  skippedCategories: string[];
}> {
  const head = await etherscanHeadBlock(client);
  const safeHead = head - opts.confirmations;
  if (opts.startBlock > safeHead) {
    return {
      rows: [],
      nextBlock: opts.startBlock,
      done: true,
      skippedCategories: [],
    };
  }
  const end = Math.min(
    opts.startBlock + opts.windowBlocks - 1,
    safeHead,
  );
  const skippedCategories: string[] = [];
  const grab = async (
    category: string,
    action: string,
  ): Promise<EtherscanRow[]> => {
    try {
      return await fetchWindow(client, {
        address: opts.address,
        action,
        startBlock: opts.startBlock,
        endBlock: end,
        pageSize: opts.pageSize,
      });
    } catch (error) {
      if (error instanceof EtherscanError && error.category === "unavailable") {
        skippedCategories.push(category);
        return [];
      }
      throw error;
    }
  };
  const txs = await grab("transactions", "txlist");
  const internal = await grab("internal", "txlistinternal");
  const tokentxs = await grab("tokens", "tokentx");
  const approvals = await grab("approvals", "tokenApprovals");
  const { events } = mapEtherscanRows(opts.address, {
    txs,
    internal,
    tokentxs,
    approvals,
  });
  return {
    rows: events,
    nextBlock: end + 1,
    done: end + 1 > safeHead,
    skippedCategories,
  };
}

export const ethereumFetchEtherscanHistoryAction = createAction({
  auth: ethereumAuth,
  name: "fetch-etherscan-history",
  displayName: "Fetch Etherscan History",
  description:
    "Import one confirmed window of an address's complete history from the Etherscan V2 API (native, internal, tokens, approvals) as ledger rows, answering the cursor for the next window. Rows are keyed by transaction hash, so re-imports are no-ops.",
  props: {
    address: Property.ShortText({
      displayName: "Address",
      description: "The 0x address to import.",
      required: true,
    }),
    startBlock: Property.Number({
      displayName: "Window start block",
      description: "First block of this window (the backfill cursor).",
      required: true,
    }),
    confirmations: Property.Number({
      displayName: "Confirmations",
      description: "Only import blocks this far behind the head. Default 9.",
      required: false,
      defaultValue: 9,
    }),
    windowBlocks: Property.Number({
      displayName: "Window size (blocks)",
      description: "Blocks per run. Default 100000.",
      required: false,
      defaultValue: 100_000,
    }),
    pageSize: Property.Number({
      displayName: "Page size (rows)",
      description: "Etherscan page size. Default 10000 (the API maximum).",
      required: false,
      defaultValue: 10_000,
    }),
  },
  async run(context) {
    const auth = etherscanConfig(authProps(context.auth));
    const client = createEtherscanClient({
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
    });
    const props = context.propsValue;
    const out = await fetchEtherscanHistory(client, {
      address: props.address,
      startBlock: props.startBlock,
      confirmations: props.confirmations ?? 9,
      windowBlocks: props.windowBlocks ?? 100_000,
      pageSize: props.pageSize ?? 10_000,
    });
    return out;
  },
});
