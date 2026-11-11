/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsAssetRegistryDocument,
  assertIsAssetRegistryState,
  assetRegistryDocumentType,
  initialGlobalState,
  initialLocalState,
  isAssetRegistryDocument,
  isAssetRegistryState,
  utils,
} from "document-models/asset-registry/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("AssetRegistry Document Model", () => {
  it("should create a new AssetRegistry document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(assetRegistryDocumentType);
  });

  it("should create a new AssetRegistry document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isAssetRegistryDocument(document)).toBe(true);
    expect(isAssetRegistryState(document.state)).toBe(true);
  });
  it("should reject a document that is not a AssetRegistry document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsAssetRegistryDocument(wrongDocumentType)).toThrow();
      expect(isAssetRegistryDocument(wrongDocumentType)).toBe(false);
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
    expect(isAssetRegistryState(wrongState.state)).toBe(false);
    expect(assertIsAssetRegistryState(wrongState.state)).toThrow();
    expect(isAssetRegistryDocument(wrongState)).toBe(false);
    expect(assertIsAssetRegistryDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isAssetRegistryState(wrongInitialState.state)).toBe(false);
    expect(assertIsAssetRegistryState(wrongInitialState.state)).toThrow();
    expect(isAssetRegistryDocument(wrongInitialState)).toBe(false);
    expect(assertIsAssetRegistryDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isAssetRegistryDocument(missingIdInHeader)).toBe(false);
    expect(assertIsAssetRegistryDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isAssetRegistryDocument(missingNameInHeader)).toBe(false);
    expect(assertIsAssetRegistryDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isAssetRegistryDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsAssetRegistryDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isAssetRegistryDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsAssetRegistryDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
