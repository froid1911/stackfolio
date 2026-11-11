import { PieceAuth, Property } from "@powerhousedao/pieces-framework";
import {
  DEFAULT_BEACON_URL,
  DEFAULT_CHAIN_ID,
  DEFAULT_RPC_URL,
} from "./client.js";

/**
 * This piece talks to the holder's own nodes, so the "auth" is node URLs —
 * nothing secret leaves the machine. All fields are optional: empty means
 * localhost defaults (`geth --http`, `prysm --beacon.rpc-port`).
 */
export const ethereumAuth = PieceAuth.CustomAuth({
  description:
    "URLs of a local Ethereum execution node (JSON-RPC) and beacon API. Leave the fields empty to use the defaults on 127.0.0.1.",
  required: true,
  props: {
    rpcUrl: Property.ShortText({
      displayName: "Execution RPC URL",
      description: `JSON-RPC endpoint, e.g. ${DEFAULT_RPC_URL}. Leave blank for the default.`,
      required: false,
    }),
    beaconUrl: Property.ShortText({
      displayName: "Beacon API URL",
      description: `Beacon-node REST API, e.g. ${DEFAULT_BEACON_URL}. Leave blank for the default.`,
      required: false,
    }),
    chainId: Property.Number({
      displayName: "Chain ID",
      description: `Defaults to ${DEFAULT_CHAIN_ID} (Ethereum mainnet).`,
      required: false,
    }),
    etherscanApiKey: Property.ShortText({
      displayName: "Etherscan API key",
      description:
        "Key for the Etherscan V2 API - Stackfolio's source of portfolio history. Kept on this connection, never in portfolio documents.",
      required: false,
    }),
    etherscanBaseUrl: Property.ShortText({
      displayName: "Etherscan base URL",
      description: "Override for mirrors; defaults to https://api.etherscan.io/v2/api.",
      required: false,
    }),
  },
  validate: async ({ auth }) => {
    if (auth.etherscanApiKey !== undefined && auth.etherscanApiKey.trim() !== "") {
      const key = auth.etherscanApiKey.trim();
      if (key.length < 16 || !/^[A-Za-z0-9-]+$/.test(key)) {
        return {
          valid: false,
          error:
            "The Etherscan API key looks malformed - an Etherscan V2 key is at least 16 letters/digits (dashes allowed).",
        };
      }
    }
    const rpcUrl = auth.rpcUrl?.trim() || DEFAULT_RPC_URL;
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { valid: false, error: `${rpcUrl} answered HTTP ${response.status}.` };
      }
      const body = (await response.json()) as { result?: string };
      const nodeChainId = Number(body.result);
      if (
        auth.chainId !== undefined &&
        nodeChainId !== auth.chainId
      ) {
        return {
          valid: false,
          error: `${rpcUrl} serves chain ${nodeChainId}, not ${auth.chainId}.`,
        };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: `Could not reach an execution node at ${rpcUrl}. Start it (e.g. geth with --http) and try again.`,
      };
    }
  },
  getConnectionIdentifier: ({ auth }) =>
    Promise.resolve(auth.rpcUrl?.trim() || DEFAULT_RPC_URL),
});

/** Default Etherscan V2 endpoint (chainid is appended per request). */
export const DEFAULT_ETHERSCAN_BASE_URL = "https://api.etherscan.io/v2/api";

/**
 * The Etherscan endpoint settings from a connection's auth. The key lives
 * only on the connection - the one document the operator marks private -
 * so every message here points there and never echoes the key.
 */
export function etherscanConfig(auth: {
  etherscanApiKey?: string;
  etherscanBaseUrl?: string;
}): { apiKey: string; baseUrl: string } {
  const apiKey = auth.etherscanApiKey?.trim() ?? "";
  if (apiKey === "") {
    throw new Error(
      "Etherscan API key is not set - set it on the ethereum connection (Stackfolio reads it from there)",
    );
  }
  return {
    apiKey,
    baseUrl:
      auth.etherscanBaseUrl?.trim() || DEFAULT_ETHERSCAN_BASE_URL,
  };
}
