import { createAction, Property } from "@powerhousedao/pieces-framework";
import { parseProtocolEntry } from "../manifest.js";
import { univ3PositionMath } from "../plugins/univ3-position-math.js";
import { globalState, toGlobalAction } from "../reactor.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PROTOCOL_REGISTRY_TYPE = "stackfolio/protocol-registry";

/** First four bytes of keccak, the ABI call selectors this action needs. */
const SELECTORS = {
  balanceOfAddress: "0x70a08231",
  nftBalanceOf: "0x6352211e",
  tokenOfOwnerByIndex: "0x2f745c59",
  positions: "0x99fbab88",
  slot0: "0x3850c7bd",
} as const;

const pad = (value: string | number | bigint): string => {
  if (typeof value === "string") {
    return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  }
  return BigInt(value).toString(16).padStart(64, "0");
};

const word = (data: string, index: number): string =>
  `0x${(data.startsWith("0x") ? data.slice(2) : data).slice(index * 64, (index + 1) * 64)}`;

/** Word read as a two's-complement signed integer (int24 lives in a word). */
function signedWord(data: string, index: number): number {
  const raw = BigInt(word(data, index));
  const bits = 256n;
  const adjusted = raw >= 1n << (bits - 1n) ? raw - (1n << bits) : raw;
  return Number(adjusted);
}

export const ethereumFetchPositionsAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-positions",
  displayName: "Fetch Positions",
  description:
    "Read the wallet's DeFi positions for one chain from the protocol-registry manifests: ERC20 POSITION contracts by balanceOf, and Uniswap v3 LP NFTs (plugins naming univ3-position-math) by enumerating the position manager and splitting liquidity over the current tick. Stores the result on the portfolio document with SET_POSITIONS, fully replacing the wallet's entry for that chain.",
  props: {
    documentId: Property.ShortText({
      displayName: "Portfolio document id",
      description:
        "The stackfolio/portfolio document that owns the tracked wallets.",
      required: true,
    }),
    wallet: Property.ShortText({
      displayName: "Wallet address",
      required: true,
    }),
    chainId: Property.Number({
      displayName: "Chain id",
      required: true,
    }),
    protocolRegistryDocumentId: Property.ShortText({
      displayName: "Protocol registry document id",
      required: true,
    }),
    rpcUrl: Property.ShortText({
      displayName: "RPC url",
      defaultValue: "http://127.0.0.1:8545",
      required: false,
    }),
  },
  async run(context) {
    const props = context.propsValue;
    const doFetch =
      (props as { fetchImpl?: typeof fetch }).fetchImpl ?? fetch;
    if (!ADDRESS.test(props.wallet)) {
      throw new Error(`wallet ${props.wallet} is not an address`);
    }
    const wallet = props.wallet.toLowerCase();
    if (!Number.isInteger(props.chainId) || props.chainId <= 0) {
      throw new Error(`chainId ${props.chainId} is not a positive integer`);
    }
    const rpcUrl = props.rpcUrl?.trim() || "http://127.0.0.1:8545";

    let rpcId = 0;
    const ethCall = async (to: string, data: string): Promise<string> => {
      const response = await doFetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++rpcId,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
      });
      const body = (await response.json()) as {
        result?: string;
        error?: { message?: string };
      };
      if (body.error || body.result == null) {
        throw new Error(
          `eth_call to ${to} failed: ${body.error?.message ?? "no result"}`,
        );
      }
      return body.result;
    };

    const registryDocument = await context.reactor.get(
      props.protocolRegistryDocumentId,
    );
    if (registryDocument.header.documentType !== PROTOCOL_REGISTRY_TYPE) {
      throw new Error(
        `${props.protocolRegistryDocumentId} is not a ${PROTOCOL_REGISTRY_TYPE} document`,
      );
    }
    const entries =
      globalState<{ protocols?: unknown[] }>(registryDocument).protocols ?? [];

    interface PositionEntry {
      protocol: string;
      kind: "SPOT" | "LP";
      assets: Array<{ asset: string; amount: string }>;
      note: string | null;
    }
    const positions: PositionEntry[] = [];
    const asset = (address: string) =>
      `eip155:${props.chainId}/erc20:${address}`;

    for (const raw of entries) {
      const manifest = parseProtocolEntry({ ...asRecord(raw) });
      if (!manifest || manifest.status !== "ACTIVE") continue;
      const chain = manifest.chains.find(
        (entry) => entry.chainId === props.chainId,
      );
      if (!chain) continue;
      const univ3 = manifest.plugins.includes("univ3-position-math");

      for (const contract of chain.contracts) {
        if (contract.kind !== "POSITION") continue;
        if (!univ3) {
          // A plain ERC20 share token: a balance is the whole position.
          const result = await ethCall(
            contract.address,
            `${SELECTORS.balanceOfAddress}${pad(wallet)}`,
          );
          const amount = BigInt(word(result, 0));
          if (amount > 0n) {
            positions.push({
              protocol: manifest.id,
              kind: "SPOT",
              assets: [{ asset: asset(contract.address), amount: amount.toString() }],
              note: contract.name,
            });
          }
          continue;
        }
        // Uniswap v3: enumerate the wallet's NFTs and split each one's
        // liquidity over the pool's current tick.
        const slot = await ethCall(contract.address, SELECTORS.slot0);
        const tick = signedWord(slot, 1);
        const countResult = await ethCall(
          contract.address,
          `${SELECTORS.nftBalanceOf}${pad(wallet)}`,
        );
        const count = Number(BigInt(word(countResult, 0)));
        for (let index = 0; index < count; index++) {
          const idResult = await ethCall(
            contract.address,
            `${SELECTORS.tokenOfOwnerByIndex}${pad(wallet)}${pad(index)}`,
          );
          const tokenId = BigInt(word(idResult, 0));
          const packed = await ethCall(
            contract.address,
            `${SELECTORS.positions}${pad(tokenId)}`,
          );
          const token0 = `0x${word(packed, 2).slice(-40)}`;
          const token1 = `0x${word(packed, 3).slice(-40)}`;
          const tickLower = signedWord(packed, 5);
          const tickUpper = signedWord(packed, 6);
          const liquidity = BigInt(word(packed, 7));
          if (liquidity === 0n) continue;
          const { amount0, amount1 } = univ3PositionMath({
            liquidity: liquidity.toString(),
            tickCurrent: tick,
            tickLower,
            tickUpper,
            token0,
            token1,
          });
          const assets = [
            { asset: asset(token0), amount: amount0 },
            { asset: asset(token1), amount: amount1 },
          ].filter((row) => row.amount !== "0");
          if (assets.length === 0) continue;
          positions.push({
            protocol: manifest.id,
            kind: "LP",
            assets,
            note: `#${tokenId.toString()}`,
          });
        }
      }
    }

    await context.reactor.execute(props.documentId, "main", [
      toGlobalAction("SET_POSITIONS", {
        wallet,
        chainId: props.chainId,
        fetchedAt: new Date().toISOString(),
        positions,
      }),
    ]);

    return { positions: positions.length };
  },
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
