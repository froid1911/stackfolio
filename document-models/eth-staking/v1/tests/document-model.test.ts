/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsEthStakingDocument,
  assertIsEthStakingState,
  ethStakingDocumentType,
  initialGlobalState,
  initialLocalState,
  isEthStakingDocument,
  isEthStakingState,
  utils,
} from "document-models/eth-staking/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("EthStaking Document Model", () => {
  it("should create a new EthStaking document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(ethStakingDocumentType);
  });

  it("should create a new EthStaking document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isEthStakingDocument(document)).toBe(true);
    expect(isEthStakingState(document.state)).toBe(true);
  });
  it("should reject a document that is not a EthStaking document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsEthStakingDocument(wrongDocumentType)).toThrow();
      expect(isEthStakingDocument(wrongDocumentType)).toBe(false);
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
    expect(isEthStakingState(wrongState.state)).toBe(false);
    expect(assertIsEthStakingState(wrongState.state)).toThrow();
    expect(isEthStakingDocument(wrongState)).toBe(false);
    expect(assertIsEthStakingDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isEthStakingState(wrongInitialState.state)).toBe(false);
    expect(assertIsEthStakingState(wrongInitialState.state)).toThrow();
    expect(isEthStakingDocument(wrongInitialState)).toBe(false);
    expect(assertIsEthStakingDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isEthStakingDocument(missingIdInHeader)).toBe(false);
    expect(assertIsEthStakingDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isEthStakingDocument(missingNameInHeader)).toBe(false);
    expect(assertIsEthStakingDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isEthStakingDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsEthStakingDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isEthStakingDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsEthStakingDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
