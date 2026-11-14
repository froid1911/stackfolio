/**
 * Opening a wallet: a stackfolio/wallet-account document in the drive,
 * bound to its address and chain. The reconciler sees the document and
 * builds its scan workflows; an address without one is never scanned.
 */
import { addDocument, getPHStore } from "@powerhousedao/reactor-browser";
import { actions as walletActions } from "document-models/wallet-account";

export const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

/** "<label or 0x12ab…cdef>", with the chain's name after any but mainnet. */
export function walletName(address: string, label: string | null, chainName: string | null): string {
  const base = label ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  return chainName ? `${base} (${chainName})` : base;
}

export async function openWallet(
  driveId: string,
  wallet: { address: string; chainId: number; label: string | null; name: string },
): Promise<string> {
  const created = await addDocument(driveId, wallet.name, WALLET_ACCOUNT_TYPE);
  const client = getPHStore()?.reactorClient;
  if (!client) throw new Error("The reactor is not ready");
  await client.write.execute(created.id, "main", [
    walletActions.setAccountDetails({
      address: wallet.address,
      chainId: wallet.chainId,
      label: wallet.label ?? undefined,
    }),
  ]);
  return created.id;
}
