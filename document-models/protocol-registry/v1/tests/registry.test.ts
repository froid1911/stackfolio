import {
  isProtocolRegistryDocument,
  reducer,
  registerProtocol,
  retireProtocol,
  updateProtocol,
  utils,
} from "document-models/protocol-registry/v1";
import { describe, expect, it } from "vitest";

const POOL = "0x87870BaFc3C93766155024821d9567e9Ab818Eb45";
const SUPPLY_TOPIC =
  "0x28d70b440705ee14826d696379d8aee1593aed013b8def255ba8dc3f1b30aa76";

const entryInput = (overrides: Record<string, unknown> = {}) => ({
  id: "aave-v3",
  chains: [
    {
      chainId: 1,
      contracts: [{ name: "pool", address: POOL, kind: "CORE" as const }],
      events: [
        {
          topic: SUPPLY_TOPIC,
          name: "Supply",
          semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" },
        },
      ],
    },
  ],
  ...overrides,
});

const registerInput = (overrides: Record<string, unknown> = {}) => ({
  entry: entryInput(overrides),
  updatedAt: "2026-11-12T00:00:00.000Z",
});

/** A document holding one registered aave-v3 manifest. */
const withAave = () =>
  reducer(utils.createDocument(), registerProtocol(registerInput()));

describe("RegistryOperations", () => {
  it("should register a protocol as ACTIVE with normalized addresses and topics", () => {
    const document = withAave();

    const operation = document.operations.global[0];
    expect(operation.error).toBeUndefined();
    const protocol = document.state.global.protocols[0];
    expect(protocol.id).toBe("aave-v3");
    expect(protocol.status).toBe("ACTIVE");
    expect(protocol.chains[0].contracts[0].address).toBe(POOL.toLowerCase());
    expect(protocol.chains[0].contracts[0].underlying).toBeNull();
    expect(protocol.chains[0].events[0].topic).toBe(SUPPLY_TOPIC.toLowerCase());
    expect(protocol.chains[0].events[0].semantic).toEqual({
      type: "SPEND",
      subtype: "DEPOSIT_ASSET",
    });
    expect(protocol.plugins).toEqual([]);
    expect(protocol.notes).toBeNull();
    expect(protocol.updatedAt).toBe("2026-11-12T00:00:00.000Z");
    expect(isProtocolRegistryDocument(document)).toBe(true);
  });

  it("should reject registering a duplicate id", () => {
    const document = reducer(
      withAave(),
      registerProtocol(registerInput({ id: "aave-v3" })),
    );

    const operation = document.operations.global[1];
    expect(operation.error).toBeDefined();
    expect(document.state.global.protocols).toHaveLength(1);
  });

  it("should replace chains on update and preserve status", () => {
    const registered = withAave();
    const updated = reducer(
      registered,
      updateProtocol(
        registerInput({
          chains: [
            {
              chainId: 1,
              contracts: [
                { name: "pool", address: POOL, kind: "CORE" as const },
                {
                  name: "debt-usdc",
                  address: "0xd974ccdfa9334dcf3b519eac1d3a2ade181b384b",
                  kind: "DEBT" as const,
                  underlying:
                    "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                },
              ],
              events: [],
            },
            {
              chainId: 42161,
              contracts: [{ name: "pool", address: POOL, kind: "CORE" as const }],
              events: [],
            },
          ],
        }),
      ),
    );

    const operation = updated.operations.global[1];
    expect(operation.error).toBeUndefined();
    const protocol = updated.state.global.protocols[0];
    expect(protocol.status).toBe("ACTIVE");
    expect(protocol.chains).toHaveLength(2);
    expect(protocol.chains[0].events).toHaveLength(0);
    expect(protocol.chains[0].contracts[1].kind).toBe("DEBT");
    expect(protocol.chains[0].contracts[1].underlying).toBe(
      "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("should reject updating an unknown protocol", () => {
    const document = reducer(
      withAave(),
      updateProtocol(registerInput({ id: "morpho-blue" })),
    );

    expect(document.operations.global[1].error).toBeDefined();
    expect(document.state.global.protocols).toHaveLength(1);
  });

  it("should retire a known protocol", () => {
    const document = reducer(
      withAave(),
      retireProtocol({ id: "aave-v3", updatedAt: "2026-11-12T12:00:00.000Z" }),
    );

    const operation = document.operations.global[1];
    expect(operation.error).toBeUndefined();
    const protocol = document.state.global.protocols[0];
    expect(protocol.status).toBe("RETIRED");
    expect(protocol.updatedAt).toBe("2026-11-12T12:00:00.000Z");
  });

  it("should reject retiring an unknown protocol", () => {
    const document = reducer(
      withAave(),
      retireProtocol({ id: "sky", updatedAt: "2026-11-12T12:00:00.000Z" }),
    );

    expect(document.operations.global[1].error).toBeDefined();
    expect(document.state.global.protocols[0].status).toBe("ACTIVE");
  });

  it("should run the full lifecycle register -> update -> retire", () => {
    let document = utils.createDocument();
    document = reducer(document, registerProtocol(registerInput()));
    document = reducer(
      document,
      updateProtocol(
        registerInput({
          chains: [
            {
              chainId: 1,
              contracts: [
                { name: "pool", address: POOL, kind: "CORE" as const },
              ],
              events: [],
            },
          ],
        }),
      ),
    );
    document = reducer(
      document,
      retireProtocol({
        id: "aave-v3",
        updatedAt: "2026-11-12T12:00:00.000Z",
      }),
    );

    const errors = document.operations.global.filter((op) => op.error);
    expect(errors).toHaveLength(0);
    expect(document.state.global.protocols).toEqual([
      {
        id: "aave-v3",
        status: "RETIRED",
        chains: [
          {
            chainId: 1,
            contracts: [
              {
                name: "pool",
                address: POOL.toLowerCase(),
                kind: "CORE",
                underlying: null,
              },
            ],
            events: [],
          },
        ],
        plugins: [],
        notes: null,
        updatedAt: "2026-11-12T12:00:00.000Z",
      },
    ]);
  });
});
