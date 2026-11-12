import {
  reducer,
  registerProtocol,
  retireProtocol,
  updateProtocol,
  utils,
} from "document-models/protocol-registry/v1";
import { describe, expect, it } from "vitest";

const chain = (
  chainId: number,
  address: string,
  topic: string,
): {
  chainId: number;
  contracts: { name: string; address: string; kind: "CORE" }[];
  events: {
    topic: string;
    name: string;
    semantic: { type: string; subtype: string };
  }[];
} => ({
  chainId,
  contracts: [{ name: "marker", address, kind: "CORE" as const }],
  events: [
    {
      topic,
      name: "Event",
      semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" },
    },
  ],
});

describe("protocol registry lifecycle", () => {
  it("keeps independent manifests side by side and retiring one leaves the other ACTIVE", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      registerProtocol({
        entry: { id: "sky", chains: [chain(1, "0xA3", "0xaa")] },
        updatedAt: "2026-11-12T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      registerProtocol({
        entry: {
          id: "uniswap-v3",
          chains: [chain(1, "0xC3", "0xbb"), chain(10, "0xC3", "0xbb")],
          plugins: ["univ3-position-math"],
          notes: "NFT positions need the math plugin",
        },
        updatedAt: "2026-11-12T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      updateProtocol({
        entry: { id: "sky", chains: [chain(1, "0xA3", "0xaa"), chain(42161, "0xAD", "0xaa")] },
        updatedAt: "2026-11-12T06:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      retireProtocol({ id: "uniswap-v3", updatedAt: "2026-11-12T12:00:00.000Z" }),
    );

    expect(document.operations.global.every((op) => !op.error)).toBe(true);
    const [sky, uniswap] = document.state.global.protocols;
    expect(sky.chains).toHaveLength(2);
    expect(sky.status).toBe("ACTIVE");
    expect(sky.updatedAt).toBe("2026-11-12T06:00:00.000Z");
    expect(uniswap.status).toBe("RETIRED");
    expect(uniswap.plugins).toEqual(["univ3-position-math"]);
    expect(uniswap.notes).toBe("NFT positions need the math plugin");
  });
});
