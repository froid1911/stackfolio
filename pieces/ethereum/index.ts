import { createPiece } from "@powerhousedao/pieces-framework";
import { ethereumFetchAccountStateAction } from "./lib/actions/fetch-account-state.js";
import { ethereumFetchEnsNamesAction } from "./lib/actions/fetch-ens-names.js";
import { ethereumFetchPositionsAction } from "./lib/actions/fetch-positions.js";
import { ethereumFetchPricesAction } from "./lib/actions/fetch-prices.js";
import { ethereumFetchEtherscanHistoryAction } from "./lib/actions/fetch-etherscan-history.js";
import { ethereumFetchEtherscanRecentAction } from "./lib/actions/fetch-etherscan-recent.js";
import { ethereumFetchTokenMetadataAction } from "./lib/actions/fetch-token-metadata.js";
import { ethereumFetchValidatorsAction } from "./lib/actions/fetch-validators.js";
import { ethereumHoldingsFromLedgerAction } from "./lib/actions/holdings-from-ledger.js";
import { ethereumImportEventsToWalletAccountAction } from "./lib/actions/import-events-to-wallet-account.js";
import { ethereumImportPricesToBookAction } from "./lib/actions/import-prices-to-book.js";
import { ethereumPinPricesAction } from "./lib/actions/pin-prices.js";
import { ethereumFetchWithdrawalsAction } from "./lib/actions/fetch-withdrawals.js";
import { ethereumImportStakingToDocAction } from "./lib/actions/import-staking-to-doc.js";
import { ethereumImportWithdrawalsToWalletsAction } from "./lib/actions/import-withdrawals-to-wallets.js";
import { ethereumImportTokensToRegistryAction } from "./lib/actions/import-tokens-to-registry.js";
import { ethereumRegisterMissingAssetsAction } from "./lib/actions/register-missing-assets.js";
import { ethereumScanAccountLogsAction } from "./lib/actions/scan-account-logs.js";
import { ethereumFetchBlockscoutHistoryAction } from "./lib/actions/fetch-blockscout-history.js";
import { ethereumFetchBlockscoutRecentAction } from "./lib/actions/fetch-blockscout-recent.js";
import { ethereumFetchAnkrHistoryAction } from "./lib/actions/fetch-ankr-history.js";
import { ethereumFetchAnkrRecentAction } from "./lib/actions/fetch-ankr-recent.js";
import { ethereumFetchBitcoinHistoryAction } from "./lib/actions/fetch-bitcoin-history.js";
import { ethereumFetchBitcoinRecentAction } from "./lib/actions/fetch-bitcoin-recent.js";
import { ethereumScanNativeTransactionsAction } from "./lib/actions/scan-native-transactions.js";
import { ethereumSnapshotPortfolioAction } from "./lib/actions/snapshot-portfolio.js";
import { ethereumSyncHyperliquidAction } from "./lib/actions/sync-hyperliquid.js";
import { ethereumOnIntervalTrigger } from "./lib/triggers/on-interval.js";
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
    ethereumFetchEtherscanHistoryAction,
    ethereumFetchEtherscanRecentAction,
    ethereumFetchBlockscoutHistoryAction,
    ethereumFetchBlockscoutRecentAction,
    ethereumFetchAnkrHistoryAction,
    ethereumFetchAnkrRecentAction,
    ethereumFetchBitcoinHistoryAction,
    ethereumFetchBitcoinRecentAction,
    ethereumFetchValidatorsAction,
    ethereumImportEventsToWalletAccountAction,
    ethereumImportTokensToRegistryAction,
    ethereumRegisterMissingAssetsAction,
    ethereumImportStakingToDocAction,
    ethereumImportPricesToBookAction,
    ethereumPinPricesAction,
    ethereumFetchWithdrawalsAction,
    ethereumImportWithdrawalsToWalletsAction,
    ethereumFetchPositionsAction,
    ethereumHoldingsFromLedgerAction,
    ethereumSnapshotPortfolioAction,
    ethereumSyncHyperliquidAction,
  ],
  triggers: [ethereumOnIntervalTrigger],
});

export default ethereum;
