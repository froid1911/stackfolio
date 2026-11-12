import type { WalletAccountAccountOperations } from "document-models/wallet-account/v1";
import { InvalidInputError } from "../../gen/account/error.js";

export const walletAccountAccountOperations: WalletAccountAccountOperations = {
  setAccountDetailsOperation(state, action) {
    if (action.input.address != null)
      state.address = action.input.address.toLowerCase();
    if (action.input.chainId != null) state.chainId = action.input.chainId;
    if (action.input.label != null) state.label = action.input.label;
  },
  setIgnoredOperation(state, action) {
    state.ignored = action.input.ignored;
  },
  setWalletXpubOperation(state, action) {
    if (action.input.xpub == null) {
      state.bitcoinXpub = null;
    } else {
      const xpub = action.input.xpub.trim();
      if (
        !/^(xpub|tpub|vpub|uppub|zpub|Zpub|Ypub)[1-9A-HJ-NP-Za-km-z]{20,}$/.test(
          xpub,
        )
      ) {
        throw new InvalidInputError(
          "xpub must be an extended public key: xpub/tpub/vpub/uppub/zpub/Zpub/Ypub in base58",
        );
      }
      state.bitcoinXpub = xpub;
    }
  },
  setEnsNamesOperation(state, action) {
    state.ensNames = action.input.names.map((entry) => ({
      name: entry.name.toLowerCase(),
      owned: entry.owned,
    }));
  },
};
