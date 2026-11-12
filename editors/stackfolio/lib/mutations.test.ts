import { describe, expect, it } from "vitest";
import { addressInput, updateAddressInput } from "./mutations.js";

describe("address mutations", () => {
  it("builds the exact AddAddressInput the model expects", () => {
    const input = addressInput({
      id: "addr-1",
      address: " 0xAD3d72E54FB669e05257a14e6D0917FB315673D2 ",
      chainId: 1,
      label: "  fr4nk  ",
      ensName: "frank.eth",
      timestamp: "2026-11-12T00:00:00.000Z",
    });
    // Address lowercased (checksums vary; the chain does not), label
    // trimmed, every schema field present with the schema's names.
    expect(input).toEqual({
      id: "addr-1",
      address: "0xad3d72e54fb669e05257a14e6d0917fb315673d2",
      chainId: 1,
      label: "fr4nk",
      ensName: "frank.eth",
      timestamp: "2026-11-12T00:00:00.000Z",
    });
  });

  it("omits blank optionals instead of sending empty strings", () => {
    const input = addressInput({
      id: "addr-2",
      address: "0xAB",
      chainId: 137,
      timestamp: "2026-11-12T00:00:00.000Z",
    });
    expect(input.label).toBeUndefined();
    expect(input.ensName).toBeUndefined();
  });

  it("builds UpdateAddressInput with id and the changed fields only", () => {
    expect(updateAddressInput({ id: "a1", label: "new" })).toEqual({
      id: "a1",
      label: "new",
    });
    expect(updateAddressInput({ id: "a1", label: undefined, ensName: "x.eth" })).toEqual({
      id: "a1",
      ensName: "x.eth",
    });
  });
});
