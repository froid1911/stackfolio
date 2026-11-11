import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth } from "../auth.js";
import { createClientBundle } from "../client.js";

const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

/** The wallet-account document's address, checked at head. */
export const ethereumFetchAccountStateAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-account-state",
  requireReactor: "read",
  displayName: "Fetch Account State",
  description:
    "Ether balance (decimal, 18 places), block number and nonce of a stackfolio/wallet-account document's address at the head of the chain.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to read.",
      required: true,
    }),
  },
  async run(context) {
    const documentId = context.propsValue.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const state = document.state as {
      global?: { address?: string };
    };
    const address = state.global?.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet — set the account details first.`,
      );
    }
    const clients = createClientBundle(context.auth.props);
    const [balance, blockNumber, nonce] = await Promise.all([
      clients.getBalance(address),
      clients.getBlockNumber(),
      clients.getNonce(address),
    ]);
    return {
      balance: balance.toString(),
      blockNumber: Number(blockNumber),
      nonce,
      accountDocumentId: documentId,
    };
  },
});
