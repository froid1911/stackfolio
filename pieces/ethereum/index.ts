import { createPiece } from "@powerhousedao/pieces-framework";
import { ethereumFetchAccountStateAction } from "./lib/actions/fetch-account-state.js";
import { ethereumFetchEnsNamesAction } from "./lib/actions/fetch-ens-names.js";
import { ethereumFetchPricesAction } from "./lib/actions/fetch-prices.js";
import { ethereumFetchTokenMetadataAction } from "./lib/actions/fetch-token-metadata.js";
import { ethereumFetchValidatorsAction } from "./lib/actions/fetch-validators.js";
import { ethereumHoldingsFromLedgerAction } from "./lib/actions/holdings-from-ledger.js";
import { ethereumImportEventsToWalletAccountAction } from "./lib/actions/import-events-to-wallet-account.js";
import { ethereumImportPricesToBookAction } from "./lib/actions/import-prices-to-book.js";
import { ethereumImportStakingToDocAction } from "./lib/actions/import-staking-to-doc.js";
import { ethereumImportTokensToRegistryAction } from "./lib/actions/import-tokens-to-registry.js";
import { ethereumScanAccountLogsAction } from "./lib/actions/scan-account-logs.js";
import { ethereumScanNativeTransactionsAction } from "./lib/actions/scan-native-transactions.js";
import { ethereumSnapshotPortfolioAction } from "./lib/actions/snapshot-portfolio.js";
import { ethereumAuth } from "./lib/auth.js";
import { ETHEREUM_LOGO } from "./lib/logo.js";

export const ethereum = createPiece({
  displayName: "Ethereum",
  description:
    "Read the holder's own Ethereum node: scan account logs into ledger events, walk native balances, resolve ENS names and read beacon-chain staking. Nothing leaves the machine.",
  auth: ethereumAuth,
  minimumSupportedRelease: "0.30.0",
  logoUrl: ETHEREUM_LOGO,
  authors: [],
  // ph generate piece-action and piece-trigger add entries here
  actions: [
    ethereumScanAccountLogsAction,
    ethereumScanNativeTransactionsAction,
    ethereumFetchAccountStateAction,
    ethereumFetchEnsNamesAction,
    ethereumFetchTokenMetadataAction,
    ethereumFetchPricesAction,
    ethereumFetchValidatorsAction,
    ethereumImportEventsToWalletAccountAction,
    ethereumImportTokensToRegistryAction,
    ethereumImportStakingToDocAction,
    ethereumImportPricesToBookAction,
    ethereumHoldingsFromLedgerAction,
    ethereumSnapshotPortfolioAction,
  ],
  triggers: [],
});

export default ethereum;
