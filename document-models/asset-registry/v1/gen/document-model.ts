import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stackfolio/asset-registry",
  name: "Asset Registry",
  author: {
    name: "Stackfolio",
    website: "https://github.com/froid1911/stackfolio",
  },
  extension: ".asr",
  description:
    "The portfolio's asset catalog: native coins and tokens by CAIP-style identifier, with display metadata and price-source mapping.",
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
            "type AssetRegistryState {\n  assets: [Asset!]!\n}\n\ntype Asset {\n  id: OID!\n  identifier: String!\n  symbol: String!\n  name: String!\n  decimals: Int!\n  kind: AssetKind!\n  chainId: Int!\n  coingeckoId: String\n  custom: Boolean!\n  addedAt: DateTime!\n}\n\nenum AssetKind {\n  NATIVE\n  ERC20\n}",
          examples: [],
          initialValue: '{"assets": []}',
        },
      },
      modules: [
        {
          id: "5efce13e-5566-45c7-a1d1-f25784b58f69",
          name: "registry",
          description: "The asset catalog",
          operations: [
            {
              id: "211b08f7-8ad6-43e6-b73f-9986a4cc2dbb",
              name: "REGISTER_ASSET",
              description: "",
              schema:
                "input RegisterAssetInput {\n  id: OID!\n  identifier: String!\n  symbol: String!\n  name: String!\n  decimals: Int!\n  kind: AssetKind!\n  chainId: Int!\n  coingeckoId: String\n  custom: Boolean!\n  addedAt: DateTime!\n}",
              template: "",
              reducer:
                "if (state.assets.some((a) => a.identifier === action.input.identifier)) {\n  throw new DuplicateAssetError(`Asset ${action.input.identifier} is already registered`);\n}\nstate.assets.push({\n  id: action.input.id,\n  identifier: action.input.identifier,\n  symbol: action.input.symbol,\n  name: action.input.name,\n  decimals: action.input.decimals,\n  kind: action.input.kind,\n  chainId: action.input.chainId,\n  coingeckoId: action.input.coingeckoId ?? null,\n  custom: action.input.custom,\n  addedAt: action.input.addedAt,\n});",
              errors: [
                {
                  id: "6a043cc4-12c4-4624-a9dc-cc0909472255",
                  name: "DuplicateAssetError",
                  code: "ASSET_EXISTS",
                  description:
                    "An asset with the same identifier is already registered",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "f834ee59-c0e7-4700-9042-660a712297de",
              name: "UPDATE_ASSET",
              description: "",
              schema:
                "input UpdateAssetInput {\n  identifier: String!\n  symbol: String\n  name: String\n  decimals: Int\n}",
              template: "",
              reducer:
                "const asset = state.assets.find((a) => a.identifier === action.input.identifier);\nif (!asset) throw new AssetNotFoundError(`Asset ${action.input.identifier} is not registered`);\nif (action.input.symbol != null) asset.symbol = action.input.symbol;\nif (action.input.name != null) asset.name = action.input.name;\nif (action.input.decimals != null) asset.decimals = action.input.decimals;",
              errors: [
                {
                  id: "509e4244-f88c-47db-9b65-c39ea892fffe",
                  name: "AssetNotFoundError",
                  code: "ASSET_NOT_FOUND",
                  description: "No asset with that identifier exists",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "4029df1a-e786-4ef7-a9b1-598ca7a31551",
              name: "SET_COINGECKO_ID",
              description: "",
              schema:
                "input SetCoingeckoIdInput {\n  identifier: String!\n  coingeckoId: String\n}",
              template: "",
              reducer:
                "const asset = state.assets.find((a) => a.identifier === action.input.identifier);\nif (!asset) throw new AssetNotFoundError(`Asset ${action.input.identifier} is not registered`);\nasset.coingeckoId = action.input.coingeckoId ?? null;",
              errors: [
                {
                  id: "9f9cf166-8428-444e-a9fe-c1dc23b3fdff",
                  name: "AssetNotFoundError",
                  code: "ASSET_NOT_FOUND",
                  description: "No asset with that identifier exists",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "77ef200e-7b7e-4f94-9e89-4b4e2165cf94",
              name: "REMOVE_ASSET",
              description: "",
              schema: "input RemoveAssetInput {\n  identifier: String!\n}",
              template: "",
              reducer:
                'const index = state.assets.findIndex((a) => a.identifier === action.input.identifier);\nif (index === -1) throw new AssetNotFoundError(`Asset ${action.input.identifier} is not registered`);\nif (!state.assets[index].custom) throw new NotCustomAssetError("Only custom assets can be removed");\nstate.assets.splice(index, 1);',
              errors: [
                {
                  id: "0e75676b-1b10-4844-af07-d233245519c0",
                  name: "AssetNotFoundError",
                  code: "ASSET_NOT_FOUND",
                  description: "No asset with that identifier exists",
                  template: "",
                },
                {
                  id: "373fd1af-39b3-4205-84c5-63a46c1f9a34",
                  name: "NotCustomAssetError",
                  code: "ASSET_NOT_CUSTOM",
                  description:
                    "Only custom (locally registered) assets can be removed",
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
