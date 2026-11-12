import {
  addAddress,
  reducer,
  removeAddress,
  setAddressIgnored,
  updateAddress,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const ADDRESS = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const MIXED_CASE = "0x1F9840a85d5Af5bf1D1762F925BDADdC4201F984";

const addInput = (overrides: Record<string, unknown> = {}) => ({
  id: "addr-1",
  address: ADDRESS,
  chainId: 1,
  label: "Hot wallet",
  ensName: "frankp.eth",
  timestamp: "2026-11-11T00:00:00.000Z",
  ...overrides,
});

const withAddress = () =>
  reducer(utils.createDocument(), addAddress(addInput()));

describe("AddressBookOperations", () => {
  it("should handle addAddress operation", () => {
    const document = reducer(
      utils.createDocument(),
      addAddress(addInput({ address: MIXED_CASE })),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    const entry = document.state.global.addresses[0];
    expect(entry.address).toBe(ADDRESS);
    expect(entry.label).toBe("Hot wallet");
    expect(entry.ensName).toBe("frankp.eth");
    expect(entry.tags).toEqual([]);
    expect(entry.ignored).toBe(false);
  });

  it("should handle updateAddress operation", () => {
    const document = reducer(
      withAddress(),
      updateAddress({ id: "addr-1", label: "Cold", tags: ["ledger"] }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    const entry = document.state.global.addresses[0];
    expect(entry.label).toBe("Cold");
    expect(entry.ensName).toBe("frankp.eth");
    expect(entry.tags).toEqual(["ledger"]);
  });

  it("should handle removeAddress operation", () => {
    const document = reducer(withAddress(), removeAddress({ id: "addr-1" }));

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.addresses).toHaveLength(0);
  });

  it("should handle setAddressIgnored operation", () => {
    const document = reducer(
      withAddress(),
      setAddressIgnored({ id: "addr-1", ignored: true }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.addresses[0].ignored).toBe(true);
  });

  it("should reject a duplicate address on the same chain", () => {
    const document = reducer(
      withAddress(),
      addAddress(addInput({ id: "addr-2", address: MIXED_CASE })),
    );

    expect(document.operations.global[1].error).toBe(
      `${ADDRESS} on chain 1 is already tracked`,
    );
    expect(document.state.global.addresses).toHaveLength(1);
  });

  it("should allow the same address on another chain", () => {
    const document = reducer(
      withAddress(),
      addAddress(addInput({ id: "addr-2", chainId: 8453 })),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.addresses).toHaveLength(2);
  });

  it("should reject updating an unknown address", () => {
    const document = reducer(
      utils.createDocument(),
      updateAddress({ id: "nope", label: "x" }),
    );

    expect(document.operations.global[0].error).toBe(
      "Address nope is not tracked",
    );
  });

  it("should reject removing an unknown address", () => {
    const document = reducer(
      utils.createDocument(),
      removeAddress({ id: "nope" }),
    );

    expect(document.operations.global[0].error).toBe(
      "Address nope is not tracked",
    );
  });

  it("should reject ignoring an unknown address", () => {
    const document = reducer(
      utils.createDocument(),
      setAddressIgnored({ id: "nope", ignored: true }),
    );

    expect(document.operations.global[0].error).toBe(
      "Address nope is not tracked",
    );
  });

  it("should accept an address without label or ENS name", () => {
    const document = reducer(
      utils.createDocument(),
      addAddress({
        id: "addr-plain",
        address: ADDRESS,
        chainId: 1,
        label: null,
        ensName: null,
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    );

    const entry = document.state.global.addresses[0];
    expect(entry.label).toBeNull();
    expect(entry.ensName).toBeNull();
  });

  it("should update only the fields that are given", () => {
    const document = reducer(
      withAddress(),
      updateAddress({ id: "addr-1", ensName: "new.eth" }),
    );

    const entry = document.state.global.addresses[0];
    expect(entry.label).toBe("Hot wallet");
    expect(entry.ensName).toBe("new.eth");
    expect(entry.tags).toEqual([]);
  });
});
