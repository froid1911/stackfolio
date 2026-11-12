/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsPortfolioDocument,
  assertIsPortfolioState,
  initialGlobalState,
  initialLocalState,
  isPortfolioDocument,
  isPortfolioState,
  portfolioDocumentType,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Portfolio Document Model", () => {
  it("should create a new Portfolio document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(portfolioDocumentType);
  });

  it("should create a new Portfolio document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isPortfolioDocument(document)).toBe(true);
    expect(isPortfolioState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Portfolio document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsPortfolioDocument(wrongDocumentType)).toThrow();
      expect(isPortfolioDocument(wrongDocumentType)).toBe(false);
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
    expect(isPortfolioState(wrongState.state)).toBe(false);
    expect(assertIsPortfolioState(wrongState.state)).toThrow();
    expect(isPortfolioDocument(wrongState)).toBe(false);
    expect(assertIsPortfolioDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isPortfolioState(wrongInitialState.state)).toBe(false);
    expect(assertIsPortfolioState(wrongInitialState.state)).toThrow();
    expect(isPortfolioDocument(wrongInitialState)).toBe(false);
    expect(assertIsPortfolioDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isPortfolioDocument(missingIdInHeader)).toBe(false);
    expect(assertIsPortfolioDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isPortfolioDocument(missingNameInHeader)).toBe(false);
    expect(assertIsPortfolioDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isPortfolioDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsPortfolioDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isPortfolioDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsPortfolioDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
