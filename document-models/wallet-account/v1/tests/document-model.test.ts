/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsWalletAccountDocument,
  assertIsWalletAccountState,
  initialGlobalState,
  initialLocalState,
  isWalletAccountDocument,
  isWalletAccountState,
  utils,
  walletAccountDocumentType,
} from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("WalletAccount Document Model", () => {
  it("should create a new WalletAccount document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(walletAccountDocumentType);
  });

  it("should create a new WalletAccount document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isWalletAccountDocument(document)).toBe(true);
    expect(isWalletAccountState(document.state)).toBe(true);
  });
  it("should reject a document that is not a WalletAccount document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsWalletAccountDocument(wrongDocumentType)).toThrow();
      expect(isWalletAccountDocument(wrongDocumentType)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
  });
  const wrongState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongState.state.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isWalletAccountState(wrongState.state)).toBe(false);
    expect(assertIsWalletAccountState(wrongState.state)).toThrow();
    expect(isWalletAccountDocument(wrongState)).toBe(false);
    expect(assertIsWalletAccountDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isWalletAccountState(wrongInitialState.state)).toBe(false);
    expect(assertIsWalletAccountState(wrongInitialState.state)).toThrow();
    expect(isWalletAccountDocument(wrongInitialState)).toBe(false);
    expect(assertIsWalletAccountDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isWalletAccountDocument(missingIdInHeader)).toBe(false);
    expect(assertIsWalletAccountDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isWalletAccountDocument(missingNameInHeader)).toBe(false);
    expect(assertIsWalletAccountDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isWalletAccountDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsWalletAccountDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isWalletAccountDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsWalletAccountDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
