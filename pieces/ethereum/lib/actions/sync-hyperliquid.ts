import { createAction, Property } from "@powerhousedao/pieces-framework";
import { HyperliquidError, createHyperliquidClient, fetchHlSnapshot, hyperliquidConfig, isHlAddress } from "../hyperliquid.js";
import { ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState, toGlobalAction } from "../reactor.js";

const HL_TYPE = "stackfolio/hyperliquid-account";

interface HlAccountState {
  address: string;
}

/**
 * Refresh every account of a hyperliquid-account document: the document
 * itself holds the list of tracked addresses (upsert them from Studio),
 * so one step reads, fetches and records - a wallet list that drifted
 * away mid-run simply misses its slot and retries next round.
 */
export const ethereumSyncHyperliquidAction = createAction({
  auth: ethereumAuth,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "sync-hyperliquid",
  displayName: "Sync Hyperliquid",
  description:
    "Fetch spot balances, perp positions and recent fills for every account of a Hyperliquid account document and record them as fresh snapshots. One unreachable or rejected address is named in the output and skipped; the run itself succeeds so the schedule keeps its cadence.",
  props: {
    hyperliquidDocumentId: Property.ShortText({
      displayName: "Hyperliquid account document",
      description: "The stackfolio/hyperliquid-account document to refresh.",
      required: true,
    }),
    ranAt: Property.ShortText({
      displayName: "Run time (ISO timestamp)",
      description: "The snapshot stamp written with each account.",
      required: true,
    }),
  },
  async run(context) {
    const documentId = context.propsValue.hyperliquidDocumentId;
    const ranAt = context.propsValue.ranAt;
    if (!Number.isFinite(Date.parse(ranAt))) {
      throw new Error(
        "ranAt must be an ISO timestamp, e.g. 2026-11-11T10:00:00.000Z.",
      );
    }
    const doc = await context.reactor.get(documentId);
    if (doc.header.documentType !== HL_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${doc.header.documentType}, not ${HL_TYPE}.`,
      );
    }
    const state = globalState<{ accounts: HlAccountState[] }>(doc);
    const accounts = state.accounts ?? [];
    if (accounts.length === 0) {
      return {
        ok: [],
        errors: [
          { address: null, message: "The document tracks no accounts yet." },
        ],
      };
    }
    const client = createHyperliquidClient(
      hyperliquidConfig(authProps(context.auth)),
    );
    const ok: string[] = [];
    const errors: Array<{ address: string | null; message: string }> = [];
    const actions: ReturnType<typeof toGlobalAction>[] = [];
    for (const account of accounts) {
      const address = account.address;
      if (!isHlAddress(address)) {
        errors.push({
          address,
          message: "Not a 0x-prefixed 40-hex-character address.",
        });
        continue;
      }
      try {
        const snapshot = await fetchHlSnapshot(client, address);
        actions.push(
          toGlobalAction("RECORD_SNAPSHOT", {
            address,
            accountValueUsd: snapshot.accountValueUsd,
            spot: snapshot.spot,
            perps: snapshot.perps,
            fills: snapshot.fills,
            updatedAt: ranAt,
          }),
        );
        ok.push(address.toLowerCase());
      } catch (error) {
        errors.push({
          address,
          message:
            error instanceof HyperliquidError || error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
    if (actions.length > 0) {
      await context.reactor.execute(documentId, "main", actions);
    }
    return { ok, errors };
  },
});
