import { createAction, Property } from "@powerhousedao/pieces-framework";
import { NATIVE_ASSET } from "../decode.js";
import { parseJsonish } from "../jsonish.js";
import { globalState, toGlobalAction } from "../reactor.js";
import { ETH_STAKING_TYPE } from "./import-staking-to-doc.js";

const GWEI_TO_WEI = 1_000_000_000n;

interface StakingState {
  validators?: Array<{ index: number; withdrawalAddress?: string | null }>;
  withdrawals?: Array<{
    withdrawalRef: number;
    validatorIndex: number;
    timestamp: string;
    amountGwei: string;
  }>;
}

interface WalletState {
  address?: string;
  chainId?: number;
  ignored?: boolean;
  ledger?: Array<{ eventIdentifier: string; sequenceIndex: number }>;
}

export interface WithdrawalEvent {
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: "STAKING";
  subtype: "WITHDRAWAL";
  asset: string;
  amount: string;
  counterparty: string;
  notes: null;
}

/**
 * The staking document's withdrawals a mainnet wallet's ledger does not
 * hold yet, as the native scan would have written them: the same
 * `withdrawal-<index>` identifier, so a withdrawal the scan already saw
 * is never imported twice. The counterparty is the wallet itself - the
 * consensus layer has no sender - which the accounting fold books as
 * staking income.
 */
export function withdrawalEvents(staking: StakingState, wallet: WalletState): WithdrawalEvent[] {
  if (wallet.ignored || wallet.chainId !== 1 || !wallet.address) return [];
  const address = wallet.address.toLowerCase();
  const validators = new Set(
    (staking.validators ?? [])
      .filter((v) => v.withdrawalAddress?.toLowerCase() === address)
      .map((v) => v.index),
  );
  if (validators.size === 0) return [];
  const held = new Set(
    (wallet.ledger ?? []).map((e) => `${e.eventIdentifier}#${e.sequenceIndex}`),
  );
  return (staking.withdrawals ?? [])
    .filter((w) => validators.has(w.validatorIndex) && /^\d+$/.test(w.amountGwei))
    .filter((w) => !held.has(`withdrawal-${w.withdrawalRef}#0`))
    .sort((a, b) => a.withdrawalRef - b.withdrawalRef)
    .map((w) => ({
      id: `withdrawal-${w.withdrawalRef}-0`,
      eventIdentifier: `withdrawal-${w.withdrawalRef}`,
      sequenceIndex: 0,
      timestamp: w.timestamp,
      type: "STAKING" as const,
      subtype: "WITHDRAWAL" as const,
      asset: NATIVE_ASSET,
      amount: (BigInt(w.amountGwei) * GWEI_TO_WEI).toString(),
      counterparty: address,
      notes: null,
    }));
}

export const ethereumImportWithdrawalsToWalletsAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "import-withdrawals-to-wallets",
  displayName: "Import Validator Withdrawals into Wallets",
  description:
    "File the staking document's beacon withdrawals into the ledger of the mainnet wallet each validator withdraws to, as STAKING/WITHDRAWAL events with the native scan's identifiers, so P&L books every reward once. Withdrawals a wallet already holds are skipped.",
  props: {
    stakingDocumentId: Property.ShortText({
      displayName: "Staking document id",
      required: true,
    }),
    walletDocumentIdsJson: Property.Json({
      displayName: "Wallet document ids (JSON)",
      required: true,
    }),
    importedAt: Property.ShortText({
      displayName: "Run timestamp (ISO)",
      required: true,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const walletIds = parseJsonish(p.walletDocumentIdsJson, "walletDocumentIdsJson");
    if (!Array.isArray(walletIds)) {
      throw new Error("walletDocumentIdsJson must be a JSON array.");
    }
    const doc = await context.reactor.get(p.stakingDocumentId.trim());
    if (doc.header.documentType !== ETH_STAKING_TYPE) {
      throw new Error(
        `Document ${p.stakingDocumentId} is a ${doc.header.documentType}, not ${ETH_STAKING_TYPE}.`,
      );
    }
    const staking = globalState<StakingState>(doc);
    const imported: Record<string, number> = {};
    for (const walletId of walletIds) {
      if (typeof walletId !== "string") continue;
      const wallet = globalState<WalletState>(await context.reactor.get(walletId));
      const events = withdrawalEvents(staking, wallet);
      if (events.length === 0) continue;
      await context.reactor.execute(walletId, "main", [
        toGlobalAction("IMPORT_EVENTS", {
          batchId: `withdrawals-${p.importedAt}`,
          importedAt: p.importedAt,
          events,
        }),
      ]);
      imported[walletId] = events.length;
    }
    return { imported };
  },
});
