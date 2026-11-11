import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth, etherscanConfig } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
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
    chainId: number;
    startBlock: number;
    confirmations: number;
    windowBlocks: number;
    pageSize: number;
    /**
     * Wall-clock budget for the walk. Windows are fetched back to back
     * until this runs out or the address reaches safe head, so one run
     * crosses empty years quickly and the step finishes inside its
     * engine timeout. 0 walks exactly one window.
     */
    budgetMs: number;
    /** Stop at a window boundary once this many rows are collected, so a
     * busy stretch of a lifetime cannot overflow memory or step payload.
     * 0 means no cap. */
    maxRows?: number;
    /** Clock seam for tests. */
    now?: () => number;
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
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const skipped = new Set<string>();
  const rows: LedgerEventRow[] = [];
  let block = opts.startBlock;
  for (;;) {
    const end = Math.min(block + opts.windowBlocks - 1, safeHead);
    const grab = async (
      category: string,
      action: string,
    ): Promise<EtherscanRow[]> => {
      try {
        return await fetchWindow(client, {
          address: opts.address,
          action,
          startBlock: block,
          endBlock: end,
          pageSize: opts.pageSize,
        });
      } catch (error) {
        if (
          error instanceof EtherscanError &&
          error.category === "unavailable"
        ) {
          skipped.add(category);
          return [];
        }
        throw error;
      }
    };
    const txs = await grab("transactions", "txlist");
    const internal = await grab("internal", "txlistinternal");
    const tokentxs = await grab("tokens", "tokentx");
    const approvals = await grab("approvals", "tokenApprovals");
    const { events } = mapEtherscanRows(opts.chainId, opts.address, {
      txs,
      internal,
      tokentxs,
      approvals,
    });
    rows.push(...events);
    block = end + 1;
    if (
      block > safeHead ||
      now() - startedAt >= opts.budgetMs ||
      (opts.maxRows !== undefined &&
        opts.maxRows > 0 &&
        rows.length >= opts.maxRows)
    ) {
      break;
    }
  }
  return {
    rows,
    nextBlock: block,
    done: block > safeHead,
    skippedCategories: [...skipped],
  };
}

export const ethereumFetchEtherscanHistoryAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-etherscan-history",
  displayName: "Fetch Etherscan History",
  description:
    "Walk an address's complete history from the Etherscan V2 API (native, internal, tokens, approvals) as ledger rows, window after window until the head or the walk budget is reached, answering the cursor for the next run. Rows are keyed by transaction hash, so re-imports are no-ops.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document whose address and backfill cursor drive the import.",
      required: true,
    }),
    startBlock: Property.Number({
      displayName: "Window start block (override)",
      description:
        "Leave empty to import from the document's backfill.nextBlock (the normal wiring). Set only to force a specific window.",
      required: false,
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
    maxRows: Property.Number({
      displayName: "Max rows per run",
      description:
        "Stop at a window boundary after this many collected rows; the next run continues. Default 5000, 0 for no cap.",
      required: false,
      defaultValue: 5_000,
    }),
    budgetMs: Property.Number({
      displayName: "Walk budget (ms)",
      description:
        "Keep walking windows within this wall-clock budget, so one run crosses empty years. Default 240000; must stay below the step timeout.",
      required: false,
      defaultValue: 240_000,
    }),
  },
  async run(context) {
    const runStartedAt = Date.now();
    const auth = etherscanConfig(authProps(context.auth));
    const props = context.propsValue;
    const documentId = props.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const global = globalState<{
      address: string;
      chainId: number | null;
      backfill: { nextBlock: number | null } | null;
    }>(document);
    const client = createEtherscanClient({
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      chainId: global.chainId ?? 1,
    });
    const address = global.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet - set the account details before importing.`,
      );
    }
    const cursor = global.backfill?.nextBlock;
    let block =
      props.startBlock ?? (cursor === null || cursor === undefined ? 0 : cursor);
    const walk = {
      address,
      chainId: global.chainId ?? 1,
      confirmations: props.confirmations ?? 9,
      windowBlocks: props.windowBlocks ?? 100_000,
      pageSize: props.pageSize ?? 10_000,
      budgetMs: props.budgetMs ?? 240_000,
      maxRows: props.maxRows ?? 5_000,
    };
    // Walk window after window inside one run - empty stretches of an
    // address's life should cost seconds, not trigger intervals.
    const rows: LedgerEventRow[] = [];
    const skipped = new Set<string>();
    let done = false;
    for (;;) {
      const out = await fetchEtherscanHistory(client, {
        ...walk,
        startBlock: block,
      });
      rows.push(...out.rows);
      for (const category of out.skippedCategories) skipped.add(category);
      block = out.nextBlock;
      done = out.done;
      if (done || Date.now() - runStartedAt >= walk.budgetMs) break;
    }
    return { rows, nextBlock: block, done, skippedCategories: [...skipped] };
  },
});
