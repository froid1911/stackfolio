import type { PortfolioAddressBookOperations } from "document-models/portfolio/v1";
import {
  AddressKnownError,
  AddressNotFoundError,
} from "../../gen/address-book/error.js";

export const portfolioAddressBookOperations: PortfolioAddressBookOperations = {
  addAddressOperation(state, action) {
    const address = action.input.address.toLowerCase();
    if (
      state.addresses.some(
        (a) => a.address === address && a.chainId === action.input.chainId,
      )
    ) {
      throw new AddressKnownError(
        `${address} on chain ${action.input.chainId} is already tracked`,
      );
    }
    state.addresses.push({
      id: action.input.id,
      address,
      chainId: action.input.chainId,
      label: action.input.label ?? null,
      ensName: action.input.ensName ?? null,
      tags: [],
      ignored: false,
      addedAt: action.input.timestamp,
    });
  },
  updateAddressOperation(state, action) {
    const entry = state.addresses.find((a) => a.id === action.input.id);
    if (!entry)
      throw new AddressNotFoundError(
        `Address ${action.input.id} is not tracked`,
      );
    if (action.input.label != null) entry.label = action.input.label;
    if (action.input.ensName != null) entry.ensName = action.input.ensName;
    if (action.input.tags != null) entry.tags = action.input.tags;
  },
  removeAddressOperation(state, action) {
    const index = state.addresses.findIndex((a) => a.id === action.input.id);
    if (index === -1)
      throw new AddressNotFoundError(
        `Address ${action.input.id} is not tracked`,
      );
    state.addresses.splice(index, 1);
  },
  setAddressIgnoredOperation(state, action) {
    const entry = state.addresses.find((a) => a.id === action.input.id);
    if (!entry)
      throw new AddressNotFoundError(
        `Address ${action.input.id} is not tracked`,
      );
    entry.ignored = action.input.ignored;
  },
};
