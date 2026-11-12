import { createAction, Property } from "@powerhousedao/pieces-framework";
import { namehash } from "viem";
import { ethereumAuth } from "../auth.js";
import { authProps, createClientBundle } from "../client.js";
import { resolveEnsName } from "../ens.js";
import { globalState, toGlobalAction } from "../reactor.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const ethereumFetchEnsNamesAction = createAction({
  auth: ethereumAuth,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-ens-names",
  displayName: "Fetch ENS Names",
  description:
    "Reverse-resolve addresses to primary ENS names through the local node (mainnet registry, with forward-confirmation that the name points back). Addresses without a provable name are silently omitted; one bad resolver never fails the batch. Given a wallet-account document, the confirmed names are stored on it (SET_ENS_NAMES), owned flagged on the wallet's own address.",
  props: {
    addressesJson: Property.LongText({
      displayName: "Addresses (JSON array)",
      description:
        'A JSON array of hex addresses, e.g. ["0x1f98…"]. Usually {{steps.state.output.address}} plus ledger counterparties.',
      required: true,
    }),
    documentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "Optional stackfolio/wallet-account document; forward-confirmed names are dispatched to it, owned true for the wallet's own address.",
      required: false,
    }),
  },
  async run(context) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context.propsValue.addressesJson);
    } catch {
      throw new Error(
        "addressesJson must be a JSON array of hex addresses.",
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error("addressesJson must be a JSON array.");
    }
    const clients = createClientBundle(authProps(context.auth));
    const labels: Record<string, string> = {};
    for (const entry of parsed) {
      if (typeof entry !== "string" || !ADDRESS.test(entry)) continue;
      const address = entry.toLowerCase();
      if (address in labels) continue;
      try {
        const name = await resolveEnsName(clients, address, namehash);
        if (name) labels[address] = name;
      } catch {
        // A resolver that reverts or misbehaves yields no label; the batch
        // goes on. Labels decorate the ledger, they never gate it.
      }
    }
    const documentId = context.propsValue.documentId?.trim();
    if (documentId) {
      try {
        const wallet = await context.reactor.get(documentId);
        if (wallet.header.documentType === WALLET_ACCOUNT_TYPE) {
          const own = (
            globalState<{ address?: string }>(wallet).address ?? ""
          ).toLowerCase();
          const seen = new Set<string>();
          const names = Object.entries(labels)
            .filter(([, name]) => {
              if (seen.has(name)) return false;
              seen.add(name);
              return true;
            })
            .map(([address, name]) => ({
              name,
              owned: own !== "" && address === own,
            }));
          if (names.length > 0) {
            await context.reactor.execute(documentId, "main", [
              toGlobalAction("SET_ENS_NAMES", { names }),
            ]);
          }
        }
      } catch {
        // Labels decorate the ledger; a missing document never fails the run.
      }
    }
    return { labels };
  },
});
