import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth } from "../auth.js";
import { authProps, createClientBundle } from "../client.js";
import { erc20Asset } from "../decode.js";
import { parseBytesString } from "../ens.js";

const SELECTOR_SYMBOL = "0x95d89b41"; // symbol()
const SELECTOR_NAME = "0x06fdde03"; // name()
const SELECTOR_DECIMALS = "0x313ce567"; // decimals()

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Some old tokens store the string in a plain bytes32 instead of ABI
 * `string`; read it raw and trim the NUL padding. */
function parseBytes32String(result: string): string | null {
  const hex = result.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 64) return null;
  const text = Buffer.from(hex, "hex")
    .toString("utf8")
    .replace(/\0.*$/s, "")
    .trim();
  return text === "" ? null : text;
}

/** One string getter; any revert, empty or odd return yields null (fallback). */
async function readString(
  ethCall: (to: string, data: string) => Promise<string>,
  token: string,
  selector: string,
): Promise<string | null> {
  try {
    const result = await ethCall(token, selector);
    if (result === "0x" || result.length < 66) return null;
    const bytes32 = parseBytes32String(result);
    if (bytes32) return bytes32;
    const text = parseBytesString(result).trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

async function readDecimals(
  ethCall: (to: string, data: string) => Promise<string>,
  token: string,
): Promise<number> {
  try {
    const result = await ethCall(token, SELECTOR_DECIMALS);
    if (result.length < 66) return 18;
    const value = Number.parseInt(result.toLowerCase().slice(-64), 16);
    return value >= 0 && value <= 250 ? value : 18;
  } catch {
    return 18;
  }
}

export const ethereumFetchTokenMetadataAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-token-metadata",
  displayName: "Fetch Token Metadata",
  description:
    "Read symbol, name and decimals of ERC-20 tokens straight from the contracts. No token can fail the run: a revert or odd return falls back to a TKN-<address> label and 18 decimals, and the asset registry keeps the truth once someone corrects it.",
  props: {
    tokensJson: Property.LongText({
      displayName: "Token addresses (JSON array)",
      description: 'A JSON array of token addresses, e.g. ["0xa0b8…"].',
      required: true,
    }),
    chainId: Property.Number({
      displayName: "Chain ID",
      description: "Chain the identifiers are minted for. Default 1.",
      required: false,
      defaultValue: 1,
    }),
  },
  async run(context) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context.propsValue.tokensJson);
    } catch {
      throw new Error(
        "tokensJson must be a JSON array of token addresses.",
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error("tokensJson must be a JSON array.");
    }
    const chainId = context.propsValue.chainId ?? 1;
    const clients = createClientBundle(authProps(context.auth));

    const tokens = [];
    for (const entry of parsed) {
      if (typeof entry !== "string" || !ADDRESS.test(entry)) continue;
      const token = entry.toLowerCase();
      const fallback = `TKN-${token.slice(2, 8)}`;
      const ethCall = (to: string, data: string) => clients.ethCall(to, data);
      const symbol = (await readString(ethCall, token, SELECTOR_SYMBOL)) ?? fallback;
      const name = (await readString(ethCall, token, SELECTOR_NAME)) ?? symbol;
      const decimals = await readDecimals(ethCall, token);
      tokens.push({
        identifier: erc20Asset(chainId, token),
        symbol,
        name,
        decimals,
        kind: "ERC20",
        chainId,
      });
    }
    return { tokens };
  },
});
