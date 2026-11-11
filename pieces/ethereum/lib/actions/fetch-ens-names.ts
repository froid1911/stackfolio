import { createAction, Property } from "@powerhousedao/pieces-framework";
import { namehash } from "viem";
import { ethereumAuth } from "../auth.js";
import { createClientBundle } from "../client.js";
import { resolveEnsName } from "../ens.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const ethereumFetchEnsNamesAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-ens-names",
  displayName: "Fetch ENS Names",
  description:
    "Reverse-resolve addresses to primary ENS names through the local node (mainnet registry, with forward-confirmation that the name points back). Addresses without a provable name are silently omitted; one bad resolver never fails the batch.",
  props: {
    addressesJson: Property.LongText({
      displayName: "Addresses (JSON array)",
      description:
        'A JSON array of hex addresses, e.g. ["0x1f98…"]. Usually {{steps.state.output.address}} plus ledger counterparties.',
      required: true,
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
    const clients = createClientBundle(context.auth.props);
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
    return { labels };
  },
});
