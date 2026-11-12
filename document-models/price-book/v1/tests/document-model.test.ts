/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsPriceBookDocument,
  assertIsPriceBookState,
  initialGlobalState,
  initialLocalState,
  isPriceBookDocument,
  isPriceBookState,
  priceBookDocumentType,
  utils,
} from "document-models/price-book/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("PriceBook Document Model", () => {
  it("should create a new PriceBook document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(priceBookDocumentType);
  });

  it("should create a new PriceBook document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isPriceBookDocument(document)).toBe(true);
    expect(isPriceBookState(document.state)).toBe(true);
  });
  it("should reject a document that is not a PriceBook document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsPriceBookDocument(wrongDocumentType)).toThrow();
      expect(isPriceBookDocument(wrongDocumentType)).toBe(false);
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
    expect(isPriceBookState(wrongState.state)).toBe(false);
    expect(assertIsPriceBookState(wrongState.state)).toThrow();
    expect(isPriceBookDocument(wrongState)).toBe(false);
    expect(assertIsPriceBookDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isPriceBookState(wrongInitialState.state)).toBe(false);
    expect(assertIsPriceBookState(wrongInitialState.state)).toThrow();
    expect(isPriceBookDocument(wrongInitialState)).toBe(false);
    expect(assertIsPriceBookDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isPriceBookDocument(missingIdInHeader)).toBe(false);
    expect(assertIsPriceBookDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isPriceBookDocument(missingNameInHeader)).toBe(false);
    expect(assertIsPriceBookDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isPriceBookDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsPriceBookDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isPriceBookDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsPriceBookDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
