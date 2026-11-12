import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stackfolio/protocol-registry",
  name: "Protocol Registry",
  author: {
    name: "froid1911",
    website: "https://github.com/froid1911/stackfolio",
  },
  extension: ".prgr",
  description:
    "Data-driven knowledge of DeFi protocol contracts and event semantics: which addresses and topics on which chains turn raw logs into semantic ledger rows (spec: protocols-accounting design, approach A).",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            "type ProtocolRegistryState {\n  protocols: [ProtocolEntry!]!\n}\n\ntype ProtocolEntry {\n  id: String!\n  status: ProtocolStatus!\n  chains: [ChainManifest!]!\n  plugins: [String!]!\n  notes: String\n  updatedAt: DateTime\n}\n\nenum ProtocolStatus {\n  ACTIVE\n  RETIRED\n}\n\ntype ChainManifest {\n  chainId: Int!\n  contracts: [ContractRef!]!\n  events: [EventRule!]!\n}\n\ntype ContractRef {\n  name: String!\n  address: String!\n  kind: ContractKind!\n  underlying: String\n}\n\nenum ContractKind {\n  CORE\n  POSITION\n  DEBT\n}\n\ntype EventRule {\n  topic: String!\n  name: String!\n  semantic: EventSemantic!\n}\n\ntype EventSemantic {\n  type: String!\n  subtype: String!\n}",
          examples: [],
          initialValue: '{"protocols":[]}',
        },
      },
      modules: [
        {
          id: "registry",
          name: "Registry",
          description: "Protocol manifest lifecycle",
          operations: [
            {
              id: "registerProtocol",
              name: "REGISTER_PROTOCOL",
              description:
                "Register a protocol manifest; duplicate ids are rejected.",
              schema:
                "input ProtocolEntryInput {\n  id: String!\n  chains: [ChainManifestInput!]!\n  plugins: [String!]\n  notes: String\n}\ninput ChainManifestInput {\n  chainId: Int!\n  contracts: [ContractRefInput!]!\n  events: [EventRuleInput!]!\n}\ninput ContractRefInput {\n  name: String!\n  address: String!\n  kind: ContractKind!\n  underlying: String\n}\ninput EventRuleInput {\n  topic: String!\n  name: String!\n  semantic: EventSemanticInput!\n}\ninput EventSemanticInput {\n  type: String!\n  subtype: String!\n}\ninput RegisterProtocolInput {\n  entry: ProtocolEntryInput!\n  updatedAt: DateTime!\n}",
              template: "Register a protocol manifest for one or more chains.",
              reducer:
                'const normalizeChains = (chains) =>\n  chains.map((chain) => ({\n    chainId: chain.chainId,\n    contracts: chain.contracts.map((contract) => ({\n      name: contract.name,\n      address: contract.address.toLowerCase(),\n      kind: contract.kind,\n      underlying: contract.underlying ?? null,\n    })),\n    events: chain.events.map((event) => ({\n      topic: event.topic.toLowerCase(),\n      name: event.name,\n      semantic: { type: event.semantic.type, subtype: event.semantic.subtype },\n    })),\n  }));\nif (state.protocols.find((protocol) => protocol.id === action.input.entry.id)) {\n  throw new InvalidInputError(\n    `protocol ${action.input.entry.id} is already registered`,\n  );\n}\nstate.protocols.push({\n  id: action.input.entry.id,\n  status: "ACTIVE",\n  chains: normalizeChains(action.input.entry.chains),\n  plugins: [...(action.input.entry.plugins ?? [])],\n  notes: action.input.entry.notes ?? null,\n  updatedAt: action.input.updatedAt,\n});',
              errors: [
                {
                  id: "registerProtocolInvalid",
                  name: "InvalidInputError",
                  code: "INVALID_INPUT",
                  description: "A protocol with this id is already registered.",
                  template: "",
                },
              ],
              examples: [
                {
                  id: "registerProtocolExample1",
                  value:
                    '{"entry":{"id":"aave-v3","chains":[{"chainId":1,"contracts":[{"name":"pool","address":"0x87870bafc3c93766155024821d9567e9ab818eb45","kind":"CORE"}],"events":[{"topic":"0x28d70b440705ee14826d696379d8aee1593aed013b8def255ba8dc3f1b30aa76","name":"Supply","semantic":{"type":"SPEND","subtype":"DEPOSIT_ASSET"}}]}],"plugins":null,"notes":null},"updatedAt":"2026-11-12T00:00:00.000Z"}',
                },
              ],
              scope: "global",
            },
            {
              id: "updateProtocol",
              name: "UPDATE_PROTOCOL",
              description:
                "Replace the chains/plugins/notes of a registered manifest; status is preserved.",
              schema:
                "input ProtocolEntryInput {\n  id: String!\n  chains: [ChainManifestInput!]!\n  plugins: [String!]\n  notes: String\n}\ninput ChainManifestInput {\n  chainId: Int!\n  contracts: [ContractRefInput!]!\n  events: [EventRuleInput!]!\n}\ninput ContractRefInput {\n  name: String!\n  address: String!\n  kind: ContractKind!\n  underlying: String\n}\ninput EventRuleInput {\n  topic: String!\n  name: String!\n  semantic: EventSemanticInput!\n}\ninput EventSemanticInput {\n  type: String!\n  subtype: String!\n}\ninput UpdateProtocolInput {\n  entry: ProtocolEntryInput!\n  updatedAt: DateTime!\n}",
              template: "Replace a registered manifest's chain data.",
              reducer:
                "const normalizeChains = (chains) =>\n  chains.map((chain) => ({\n    chainId: chain.chainId,\n    contracts: chain.contracts.map((contract) => ({\n      name: contract.name,\n      address: contract.address.toLowerCase(),\n      kind: contract.kind,\n      underlying: contract.underlying ?? null,\n    })),\n    events: chain.events.map((event) => ({\n      topic: event.topic.toLowerCase(),\n      name: event.name,\n      semantic: { type: event.semantic.type, subtype: event.semantic.subtype },\n    })),\n  }));\nconst existing = state.protocols.find(\n  (protocol) => protocol.id === action.input.entry.id,\n);\nif (!existing) {\n  throw new EntityNotFoundError(\n    `no protocol ${action.input.entry.id} is registered`,\n  );\n}\nexisting.chains = normalizeChains(action.input.entry.chains);\nexisting.plugins = [...(action.input.entry.plugins ?? [])];\nexisting.notes = action.input.entry.notes ?? null;\nexisting.updatedAt = action.input.updatedAt;",
              errors: [
                {
                  id: "updateProtocolNotFound",
                  name: "EntityNotFoundError",
                  code: "ENTITY_NOT_FOUND",
                  description: "No protocol with this id is registered.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "retireProtocol",
              name: "RETIRE_PROTOCOL",
              description:
                "Mark a protocol RETIRED; decoding stops using it, history keeps the counterparty tag.",
              schema:
                "input RetireProtocolInput {\n  id: String!\n  updatedAt: DateTime!\n}",
              template: "Retire a protocol manifest.",
              reducer:
                'const existing = state.protocols.find(\n  (protocol) => protocol.id === action.input.id,\n);\nif (!existing) {\n  throw new EntityNotFoundError(`no protocol ${action.input.id} is registered`);\n}\nexisting.status = "RETIRED";\nexisting.updatedAt = action.input.updatedAt;',
              errors: [
                {
                  id: "retireProtocolNotFound",
                  name: "EntityNotFoundError",
                  code: "ENTITY_NOT_FOUND",
                  description: "No protocol with this id is registered.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
