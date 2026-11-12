import type {
  ChainManifest,
  ChainManifestInput,
} from "document-models/protocol-registry/v1";
import type { ProtocolRegistryRegistryOperations } from "document-models/protocol-registry/v1";
import {
  EntityNotFoundError,
  InvalidInputError,
} from "../../gen/registry/error.js";

/** Copy a manifest with normalized (lowercase) addresses and topics. */
function normalizeChains(chains: ChainManifestInput[]): ChainManifest[] {
  return chains.map((chain) => ({
    chainId: chain.chainId,
    contracts: chain.contracts.map((contract) => ({
      name: contract.name,
      address: contract.address.toLowerCase(),
      kind: contract.kind,
      underlying: contract.underlying ?? null,
    })),
    events: chain.events.map((event) => ({
      topic: event.topic.toLowerCase(),
      name: event.name,
      semantic: {
        type: event.semantic.type,
        subtype: event.semantic.subtype,
      },
    })),
  }));
}

export const protocolRegistryRegistryOperations: ProtocolRegistryRegistryOperations =
  {
    registerProtocolOperation(state, action) {
      if (
        state.protocols.find(
          (protocol) => protocol.id === action.input.entry.id,
        )
      ) {
        throw new InvalidInputError(
          `protocol ${action.input.entry.id} is already registered`,
        );
      }
      state.protocols.push({
        id: action.input.entry.id,
        status: "ACTIVE",
        chains: normalizeChains(action.input.entry.chains),
        plugins: [...(action.input.entry.plugins ?? [])],
        notes: action.input.entry.notes ?? null,
        updatedAt: action.input.updatedAt,
      });
    },
    updateProtocolOperation(state, action) {
      const existing = state.protocols.find(
        (protocol) => protocol.id === action.input.entry.id,
      );
      if (!existing) {
        throw new EntityNotFoundError(
          `no protocol ${action.input.entry.id} is registered`,
        );
      }
      existing.chains = normalizeChains(action.input.entry.chains);
      existing.plugins = [...(action.input.entry.plugins ?? [])];
      existing.notes = action.input.entry.notes ?? null;
      existing.updatedAt = action.input.updatedAt;
    },
    retireProtocolOperation(state, action) {
      const existing = state.protocols.find(
        (protocol) => protocol.id === action.input.id,
      );
      if (!existing) {
        throw new EntityNotFoundError(
          `no protocol ${action.input.id} is registered`,
        );
      }
      existing.status = "RETIRED";
      existing.updatedAt = action.input.updatedAt;
    },
  };
