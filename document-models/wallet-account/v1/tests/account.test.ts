import { actions, reducer, utils } from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

const { setAccountDetails, setIgnored } = actions;

describe("AccountOperations", () => {
  it("should handle setAccountDetails operation", () => {
    const document = reducer(
      utils.createDocument(),
      setAccountDetails({
        address: "0x1F9840a85d5Af5bf1D1762F925BDADdC4201F984",
        chainId: 1,
        label: "frankp.eth",
      }),
    );

    expect(document.state.global.address).toBe(
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    );
    expect(document.state.global.chainId).toBe(1);
    expect(document.state.global.label).toBe("frankp.eth");
  });

  it("should apply only the given details", () => {
    let document = reducer(
      utils.createDocument(),
      setAccountDetails({ address: "0xabc", chainId: 1, label: "first" }),
    );
    document = reducer(document, setAccountDetails({ label: "renamed" }));
    document = reducer(document, setAccountDetails({ chainId: 8453 }));

    expect(document.state.global.address).toBe("0xabc");
    expect(document.state.global.chainId).toBe(8453);
    expect(document.state.global.label).toBe("renamed");
  });

  it("should handle setIgnored operation", () => {
    let document = reducer(
      utils.createDocument(),
      setIgnored({ ignored: true }),
    );
    expect(document.state.global.ignored).toBe(true);

    document = reducer(document, setIgnored({ ignored: false }));
    expect(document.state.global.ignored).toBe(false);
  });
});
