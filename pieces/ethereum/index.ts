import { createPiece } from "@powerhousedao/pieces-framework";
import { ethereumScanAccountLogsAction } from "./lib/actions/scan-account-logs.js";
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
  actions: [ethereumScanAccountLogsAction],
  triggers: [],
});

export default ethereum;
