/**
 * Portfolio-document writes, so views dispatch the model's own actions
 * with inputs that always satisfy its zod schemas (the shape lives in
 * document-models/portfolio/v1/gen/schema/zod.ts; the builders keep the
 * nullish optionals absent rather than empty).
 */
import { useDocumentById } from "@powerhousedao/reactor-browser";
import { actions as portfolioActions } from "document-models/portfolio";

export interface AddressDraft {
  id: string;
  address: string;
  chainId: number;
  label?: string;
  ensName?: string;
  timestamp: string;
}

/** `ADD_ADDRESS`'s input: address lowercased (checksums vary; the chain
 * does not), label/ens trimmed, blanks omitted. */
export function addressInput(draft: AddressDraft) {
  const label = draft.label?.trim() || undefined;
  const ensName = draft.ensName?.trim() || undefined;
  return {
    id: draft.id,
    address: draft.address.trim().toLowerCase(),
    chainId: draft.chainId,
    ...(label !== undefined ? { label } : {}),
    ...(ensName !== undefined ? { ensName } : {}),
    timestamp: draft.timestamp,
  };
}

/** `UPDATE_ADDRESS`'s input: the id plus only the fields given. */
export function updateAddressInput(fields: {
  id: string;
  label?: string;
  ensName?: string;
}) {
  const label = fields.label?.trim();
  const ensName = fields.ensName?.trim();
  return {
    id: fields.id,
    ...(label ? { label } : {}),
    ...(ensName ? { ensName } : {}),
  };
}

/**
 * Dispatch against the portfolio document by id, and expose the action
 * creators the address-book and price views call. `ready` is false until
 * the document is in the cache; dispatching before then is a no-op the
 * UI must not offer.
 */
export function usePortfolioActions(id: string | undefined) {
  const [document, dispatch] = useDocumentById(id);
  return {
    ready: document !== undefined,
    addAddress: (draft: AddressDraft) =>
      dispatch([portfolioActions.addAddress(addressInput(draft))]),
    updateAddress: (fields: { id: string; label?: string; ensName?: string }) =>
      dispatch([portfolioActions.updateAddress(updateAddressInput(fields))]),
    removeAddress: (id: string) =>
      dispatch([portfolioActions.removeAddress({ id })]),
    setAddressIgnored: (id: string, ignored: boolean) =>
      dispatch([portfolioActions.setAddressIgnored({ id, ignored })]),
    setPriceOverride: (input: Parameters<typeof portfolioActions.setPriceOverride>[0]) =>
      dispatch([portfolioActions.setPriceOverride(input)]),
    removePriceOverride: (asset: string) =>
      dispatch([portfolioActions.removePriceOverride({ asset })]),
    addBundle: (input: { id: string; name: string; addresses: string[] }) =>
      dispatch([portfolioActions.addBundle(input)]),
    updateBundle: (input: { id: string; name?: string; addresses?: string[] }) =>
      dispatch([portfolioActions.updateBundle(input)]),
    removeBundle: (id: string) => dispatch([portfolioActions.removeBundle({ id })]),
    setEventCategories: (input: Parameters<typeof portfolioActions.setEventCategories>[0]) =>
      dispatch([portfolioActions.setEventCategories(input)]),
    clearEventCategories: (input: Parameters<typeof portfolioActions.clearEventCategories>[0]) =>
      dispatch([portfolioActions.clearEventCategories(input)]),
    addCategoryRule: (input: Parameters<typeof portfolioActions.addCategoryRule>[0]) =>
      dispatch([portfolioActions.addCategoryRule(input)]),
    setAssetIgnored: (assets: string[], ignored: boolean) =>
      dispatch(assets.map((asset) => portfolioActions.setAssetIgnored({ asset, ignored }))),
    setAssetTrusted: (asset: string, trusted: boolean) =>
      dispatch([portfolioActions.setAssetTrusted({ asset, trusted })]),
  };
}
