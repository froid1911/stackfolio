/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsHyperliquidAccountDocument,
  assertIsHyperliquidAccountState,
  hyperliquidAccountDocumentType,
  initialGlobalState,
  initialLocalState,
  isHyperliquidAccountDocument,
  isHyperliquidAccountState,
  utils,
} from "document-models/hyperliquid-account/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("HyperliquidAccount Document Model", () => {
  it("should create a new HyperliquidAccount document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(hyperliquidAccountDocumentType);
  });

  it("should create a new HyperliquidAccount document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isHyperliquidAccountDocument(document)).toBe(true);
    expect(isHyperliquidAccountState(document.state)).toBe(true);
  });
  it("should reject a document that is not a HyperliquidAccount document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsHyperliquidAccountDocument(wrongDocumentType)).toThrow();
      expect(isHyperliquidAccountDocument(wrongDocumentType)).toBe(false);
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
    expect(isHyperliquidAccountState(wrongState.state)).toBe(false);
    expect(assertIsHyperliquidAccountState(wrongState.state)).toThrow();
    expect(isHyperliquidAccountDocument(wrongState)).toBe(false);
    expect(assertIsHyperliquidAccountDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isHyperliquidAccountState(wrongInitialState.state)).toBe(false);
    expect(assertIsHyperliquidAccountState(wrongInitialState.state)).toThrow();
    expect(isHyperliquidAccountDocument(wrongInitialState)).toBe(false);
    expect(assertIsHyperliquidAccountDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isHyperliquidAccountDocument(missingIdInHeader)).toBe(false);
    expect(assertIsHyperliquidAccountDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isHyperliquidAccountDocument(missingNameInHeader)).toBe(false);
    expect(assertIsHyperliquidAccountDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isHyperliquidAccountDocument(missingCreatedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsHyperliquidAccountDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(
      isHyperliquidAccountDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toBe(false);
    expect(
      assertIsHyperliquidAccountDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
