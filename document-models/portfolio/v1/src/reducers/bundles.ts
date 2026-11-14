import type {
  Bundle,
  PortfolioBundlesOperations,
  PortfolioState,
} from "document-models/portfolio/v1";
import {
  BundleNotFoundError,
  DuplicateBundleNameError,
  EmptyBundleError,
  UnknownBundleAddressError,
} from "../../gen/bundles/error.js";

/** Documents made before bundles existed carry no list yet. */
function bundlesOf(state: PortfolioState): Bundle[] {
  const loaded = state as Partial<PortfolioState>;
  if (!loaded.bundles) loaded.bundles = [];
  return loaded.bundles;
}

function checkedName(
  bundles: Bundle[],
  name: string,
  selfId: string | null,
): string {
  const trimmed = name.trim();
  if (!trimmed) throw new EmptyBundleError("A bundle needs a name");
  const key = trimmed.toLowerCase();
  if (bundles.some((b) => b.id !== selfId && b.name.toLowerCase() === key)) {
    throw new DuplicateBundleNameError(`A bundle named ${trimmed} exists`);
  }
  return trimmed;
}

/** Lower-cased, de-duplicated, and each one tracked by the portfolio. */
function checkedAddresses(state: PortfolioState, addresses: string[]): string[] {
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (wanted.length === 0) {
    throw new EmptyBundleError("A bundle needs at least one wallet");
  }
  const known = new Set(state.addresses.map((a) => a.address));
  const unknown = wanted.find((a) => !known.has(a));
  if (unknown) {
    throw new UnknownBundleAddressError(`${unknown} is not in the portfolio`);
  }
  return wanted;
}

export const portfolioBundlesOperations: PortfolioBundlesOperations = {
  addBundleOperation(state, action) {
    const bundles = bundlesOf(state);
    bundles.push({
      id: action.input.id,
      name: checkedName(bundles, action.input.name, null),
      addresses: checkedAddresses(state, action.input.addresses),
    });
  },
  updateBundleOperation(state, action) {
    const bundles = bundlesOf(state);
    const bundle = bundles.find((b) => b.id === action.input.id);
    if (!bundle) {
      throw new BundleNotFoundError(`Bundle ${action.input.id} does not exist`);
    }
    if (action.input.name != null) {
      bundle.name = checkedName(bundles, action.input.name, bundle.id);
    }
    if (action.input.addresses != null) {
      bundle.addresses = checkedAddresses(state, action.input.addresses);
    }
  },
  removeBundleOperation(state, action) {
    const bundles = bundlesOf(state);
    const index = bundles.findIndex((b) => b.id === action.input.id);
    if (index === -1) {
      throw new BundleNotFoundError(`Bundle ${action.input.id} does not exist`);
    }
    bundles.splice(index, 1);
  },
};
