import { keccak_256 } from "@noble/hashes/sha3.js";
import { describe, expect, it } from "vitest";
import {
  manifestForChain,
  parseProtocolEntry,
  type ProtocolManifest,
} from "./manifest.js";
import { SEED_MANIFESTS } from "./manifests/index.js";

const hex = (bytes: Uint8Array): string =>
  "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** keccak of the canonical signature of an event ABI fragment. */
const topicFromAbi = (abi: string): string => {
  const body = abi.replace(/^event\s+/, "").replace(/\);?\s*$/, "");
  const name = body.slice(0, body.indexOf("("));
  const params = body.slice(body.indexOf("(") + 1).split(",");
  const types = params.map((param) => {
    let token = param.trim().split(/\s+/)[0];
    if (token === "indexed") token = param.trim().split(/\s+/)[1];
    return token.replace(/^uint$/, "uint256").replace(/^int$/, "int256");
  });
  return hex(keccak_256(new TextEncoder().encode(`${name}(${types.join(",")})`)));
};

const VALID_ENTRY = {
  id: "aave-v3",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "pool", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", kind: "CORE" },
      ],
      events: [
        {
          topic: "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61",
          name: "Supply",
          semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" },
        },
      ],
    },
  ],
  plugins: [],
  notes: null,
};

describe("manifest parsing", () => {
  it("parses a valid registry entry", () => {
    const manifest = parseProtocolEntry(VALID_ENTRY);
    expect(manifest).not.toBeNull();
    expect(manifest?.id).toBe("aave-v3");
    expect(manifest?.chains[0].contracts[0].address).toBe(
      "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    );
    expect(manifest?.chains[0].events[0].topic).toBe(
      "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61",
    );
  });

  it("defaults a missing status to ACTIVE", () => {
    const entry = { ...VALID_ENTRY, status: undefined };
    expect(parseProtocolEntry(entry)?.status).toBe("ACTIVE");
  });

  it("rejects malformed entries without throwing", () => {
    expect(parseProtocolEntry(null)).toBeNull();
    expect(parseProtocolEntry({ ...VALID_ENTRY, id: 5 })).toBeNull();
    expect(
      parseProtocolEntry({
        ...VALID_ENTRY,
        chains: [{ chainId: 1, contracts: [{ name: "x", address: "nope", kind: "CORE" }], events: [] }],
      }),
    ).toBeNull();
    expect(
      parseProtocolEntry({
        ...VALID_ENTRY,
        chains: [
          {
            chainId: 1,
            contracts: [],
            events: [
              {
                topic: "0xdeadbeef",
                name: "X",
                semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" },
              },
            ],
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseProtocolEntry({
        ...VALID_ENTRY,
        chains: [
          {
            chainId: 1,
            contracts: [],
            events: [
              {
                topic: "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61",
                name: "X",
                semantic: { type: "NOT_A_TYPE", subtype: "DEPOSIT_ASSET" },
              },
            ],
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseProtocolEntry({
        ...VALID_ENTRY,
        chains: [
          {
            chainId: 1,
            contracts: [
              { name: "pool", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", kind: "WAT" },
            ],
            events: [],
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("manifestForChain", () => {
  const sky = {
    ...VALID_ENTRY,
    id: "sky",
    status: "RETIRED",
  };

  it("keeps only ACTIVE protocols with a manifest on the chain", () => {
    const result = manifestForChain([VALID_ENTRY, sky], 1);
    expect(result.protocols.map((p) => p.id)).toEqual(["aave-v3"]);
  });

  it("drops protocols without a manifest for the requested chain", () => {
    expect(manifestForChain([VALID_ENTRY], 42161).protocols).toHaveLength(0);
  });

  it("flattens contracts and event rules for the chain", () => {
    const result = manifestForChain([VALID_ENTRY], 1);
    expect(result.contracts[0].address).toBe(
      "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    );
    expect(result.events[0].semantic.subtype).toBe("DEPOSIT_ASSET");
  });
});

describe("seed manifests", () => {
  it("every seed parses as a valid manifest", () => {
    for (const seed of SEED_MANIFESTS) {
      expect(parseProtocolEntry(seed), seed.id).not.toBeNull();
    }
  });

  it("every event rule topic equals the keccak of its ABI fragment", () => {
    const rules = SEED_MANIFESTS.flatMap((seed) =>
      seed.chains.flatMap((chain) =>
        chain.events.map((event) => ({ seed: seed.id, event })),
      ),
    );
    expect(rules.length).toBeGreaterThan(5);
    for (const { seed, event } of rules) {
      expect(event.abi, `${seed}/${event.name}`).toBeTruthy();
      expect(topicFromAbi(event.abi as string), `${seed}/${event.name}`).toBe(
        event.topic,
      );
    }
  });

  it("covers the launch protocols on their known chains", () => {
    const ids = SEED_MANIFESTS.map((m) => m.id).sort();
    expect(ids).toEqual([
      "aave-v3",
      "balancer-v1",
      "convex",
      "curve",
      "ens",
      "sky",
      "sushiswap-chef",
      "uniswap-v2",
      "uniswap-v3",
    ]);
    const aave = SEED_MANIFESTS.find((m) => m.id === "aave-v3") as ProtocolManifest;
    expect(new Set(aave.chains.map((c) => c.chainId))).toEqual(
      new Set([1, 10, 56, 137, 42161, 8453, 43114]),
    );
    const uniswap = SEED_MANIFESTS.find(
      (m) => m.id === "uniswap-v3",
    ) as ProtocolManifest;
    const manager = (chainId: number) =>
      manifestForChain([uniswap], chainId).contracts.map(
        (contract) => contract.address,
      );
    expect(manager(1)).toContain(
      "0xc36442b4a4522e871399cd717abdd847ab11fe88",
    );
    expect(manager(8453)).toContain(
      "0x03a520b32c04bf3beef7beb72e919cf822ed34f1",
    );
  });

  it("names the plugins its position sweep needs", () => {
    // fetch-positions gates every non-ERC20 position read on the entry's
    // plugin list: a missing plugin makes the sweep read the contract as a
    // plain share token (revert for the Uniswap NFT manager, silent skip
    // for money-market pools). The seed must carry them.
    const plugins = Object.fromEntries(
      SEED_MANIFESTS.map((m) => [m.id, m.plugins]),
    );
    expect(plugins["aave-v3"]).toContain("aave-v3");
    expect(plugins["uniswap-v3"]).toContain("univ3-position-math");
  });
});
