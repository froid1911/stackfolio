/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsProtocolRegistryDocument,
  assertIsProtocolRegistryState,
  initialGlobalState,
  initialLocalState,
  isProtocolRegistryDocument,
  isProtocolRegistryState,
  protocolRegistryDocumentType,
  utils,
} from "document-models/protocol-registry/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("ProtocolRegistry Document Model", () => {
  it("should create a new ProtocolRegistry document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(protocolRegistryDocumentType);
  });

  it("should create a new ProtocolRegistry document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isProtocolRegistryDocument(document)).toBe(true);
    expect(isProtocolRegistryState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ProtocolRegistry document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsProtocolRegistryDocument(wrongDocumentType)).toThrow();
      expect(isProtocolRegistryDocument(wrongDocumentType)).toBe(false);
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
    expect(isProtocolRegistryState(wrongState.state)).toBe(false);
    expect(assertIsProtocolRegistryState(wrongState.state)).toThrow();
    expect(isProtocolRegistryDocument(wrongState)).toBe(false);
    expect(assertIsProtocolRegistryDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isProtocolRegistryState(wrongInitialState.state)).toBe(false);
    expect(assertIsProtocolRegistryState(wrongInitialState.state)).toThrow();
    expect(isProtocolRegistryDocument(wrongInitialState)).toBe(false);
    expect(assertIsProtocolRegistryDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isProtocolRegistryDocument(missingIdInHeader)).toBe(false);
    expect(assertIsProtocolRegistryDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isProtocolRegistryDocument(missingNameInHeader)).toBe(false);
    expect(assertIsProtocolRegistryDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isProtocolRegistryDocument(missingCreatedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsProtocolRegistryDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(
      isProtocolRegistryDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toBe(false);
    expect(
      assertIsProtocolRegistryDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
