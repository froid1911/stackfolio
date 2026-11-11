import type { WalletAccountAccountOperations } from "document-models/wallet-account/v1";

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
};
