import { generateMock } from "document-model/mock";
import {
  isWalletAccountDocument,
  reducer,
  setAccountDetails,
  setEnsNames,
  SetEnsNamesInputSchema,
  setIgnored,
  setWalletXpub,
  utils,
} from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

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

  describe("SET_WALLET_XPUB", () => {
    // The BIP-84 account xpub of the abandon-mnemonic test vector.
    const XPUB =
      "xpub6Bm9M1SxZdzL3TxdNV8897FgtTLBgehR1wVNnMyJ5VLRK5n3tFqXxrCVnVQ" +
      "j4zooN4eFSkf6Sma84reWc5ZCXMxPbLXQs3BcaBdTd4YQa3B";

    it("stores a valid extended public key", () => {
      const document = reducer(
        utils.createDocument(),
        setWalletXpub({ xpub: XPUB }),
      );
      expect(document.state.global.bitcoinXpub).toBe(XPUB);
    });

    it("clears the key on a null input", () => {
      let document = reducer(
        utils.createDocument(),
        setWalletXpub({ xpub: XPUB }),
      );
      document = reducer(document, setWalletXpub({ xpub: null }));
      expect(document.state.global.bitcoinXpub).toBeNull();
    });

    it("rejects a string that is not an extended public key", () => {
      const document = reducer(
        utils.createDocument(),
        setWalletXpub({ xpub: "xpub-not base58 here!!" }),
      );
      expect(document.state.global.bitcoinXpub ?? null).toBeNull();
      expect(document.operations.global[0].error).toBe(
        "xpub must be an extended public key: xpub/tpub/vpub/uppub/zpub/Zpub/Ypub in base58",
      );
    });
  });

  it("should handle setEnsNames operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetEnsNamesInputSchema());

    const updatedDocument = reducer(document, setEnsNames(input));

    expect(isWalletAccountDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    // A rejected operation records its error; give it the state it needs.
    expect(updatedDocument.operations.global[0].error).toBeUndefined();
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_ENS_NAMES",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
