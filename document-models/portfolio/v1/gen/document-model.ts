import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stackfolio/portfolio",
  name: "Portfolio",
  author: {
    name: "Stackfolio",
    website: "https://github.com/froid1911/stackfolio",
  },
  extension: ".folio",
  description:
    "One crypto portfolio: tracked addresses, price controls, snapshots and the reconciler's record of its own wiring.",
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
            "type PortfolioState {\n  name: String\n  baseCurrency: String!\n  addresses: [AddressEntry!]!\n  priceOverrides: [PriceOverride!]!\n  ignoredAssets: [String!]!\n  autoSnapshot: AutoSnapshot!\n  snapshots: [Snapshot!]!\n  positions: [WalletPositions!]!\n  resources: ManagedResources\n  lastCheck: ReconcilerCheck\n  grant: GrantInfo\n}\n\ntype AddressEntry {\n  id: OID!\n  address: String!\n  chainId: Int!\n  label: String\n  ensName: String\n  tags: [String!]!\n  ignored: Boolean!\n  addedAt: DateTime!\n}\n\ntype PriceOverride {\n  asset: String!\n  price: String!\n  setAt: DateTime!\n}\n\ntype AutoSnapshot {\n  enabled: Boolean!\n  intervalHours: Int!\n}\n\ntype Snapshot {\n  id: OID!\n  timestamp: DateTime!\n  totalValue: String!\n  netWorth: String\n  liabilities: [SnapshotLiability!]\n  perLocation: [LocationValue!]!\n  perAsset: [AssetValue!]!\n}\n\ntype SnapshotLiability {\n  asset: String!\n  amount: String!\n}\n\ntype LocationValue {\n  location: String!\n  value: String!\n}\n\ntype AssetValue {\n  asset: String!\n  amount: String!\n  value: String!\n}\n\ntype WalletPositions {\n  wallet: String!\n  chainId: Int!\n  fetchedAt: DateTime!\n  positions: [PositionEntry!]!\n}\n\ntype PositionEntry {\n  protocol: String!\n  kind: PositionKind!\n  assets: [PositionAsset!]!\n  note: String\n}\n\ntype PositionAsset {\n  asset: String!\n  amount: String!\n}\n\nenum PositionKind {\n  SPOT\n  LP\n}\n\ntype ManagedResources {\n  connectionId: String!\n  workflowIds: [String!]!\n}\n\ntype ReconcilerCheck {\n  at: DateTime!\n  issues: [ReconcilerIssue!]!\n  fixes: [ReconcilerFix!]!\n}\n\ntype ReconcilerIssue {\n  code: String!\n  severity: IssueSeverity!\n  message: String!\n  accountId: String\n}\n\ntype ReconcilerFix {\n  code: String!\n  message: String!\n  at: DateTime!\n}\n\nenum IssueSeverity {\n  BLOCKING\n  WARNING\n}\n\ntype GrantInfo {\n  id: String!\n  name: String\n  grantedAt: DateTime\n}",
          examples: [],
          initialValue:
            '{"name": null, "baseCurrency": "EUR", "addresses": [], "priceOverrides": [], "ignoredAssets": [], "autoSnapshot": {"enabled": false, "intervalHours": 24}, "snapshots": [], "positions": [], "resources": null, "lastCheck": null, "grant": null}',
        },
      },
      modules: [
        {
          id: "04a8e5e8-dc52-42ee-9d74-8503646895b9",
          name: "identity",
          operations: [
            {
              id: "03fa8602-6ce0-4e1d-ac43-59816898bd9a",
              name: "SET_PORTFOLIO_DETAILS",
              scope: "global",
              errors: [
                {
                  id: "7369949a-d8e0-42d8-b365-63022beb6572",
                  code: "INVALID_CURRENCY",
                  name: "InvalidCurrencyError",
                  template: "",
                  description: "The base currency is not a 3-letter code",
                },
                {
                  id: "92221b42-6348-4ff5-aa06-43299476b5bf",
                  code: "CURRENCY_LOCKED",
                  name: "CurrencyLockedError",
                  template: "",
                  description:
                    "The base currency cannot change once snapshots exist",
                },
              ],
              schema:
                "input SetPortfolioDetailsInput {\n  name: String\n  baseCurrency: String\n  autoSnapshotEnabled: Boolean\n  autoSnapshotIntervalHours: Int\n}",
              reducer:
                'if (action.input.baseCurrency != null && !/^[A-Z]{3}$/.test(action.input.baseCurrency)) {\n  throw new InvalidCurrencyError(`${action.input.baseCurrency} is not a 3-letter currency code`);\n}\nif (\n  action.input.baseCurrency != null &&\n  action.input.baseCurrency !== state.baseCurrency &&\n  state.snapshots.length > 0\n) {\n  throw new CurrencyLockedError("Cannot change the base currency once snapshots exist");\n}\nif (action.input.name != null) state.name = action.input.name;\nif (action.input.baseCurrency != null) state.baseCurrency = action.input.baseCurrency;\nif (action.input.autoSnapshotEnabled != null) state.autoSnapshot.enabled = action.input.autoSnapshotEnabled;\nif (action.input.autoSnapshotIntervalHours != null) state.autoSnapshot.intervalHours = action.input.autoSnapshotIntervalHours;',
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "Portfolio name, currency and snapshot automation",
        },
        {
          id: "d91d91a1-f820-45e8-b362-9b63a9f291fd",
          name: "address-book",
          operations: [
            {
              id: "86b11857-4a86-49ac-8352-88d16553200e",
              name: "ADD_ADDRESS",
              scope: "global",
              errors: [
                {
                  id: "422e5028-0cc6-4759-b125-b5b76f700398",
                  code: "ADDRESS_KNOWN",
                  name: "AddressKnownError",
                  template: "",
                  description: "This address is already tracked on this chain",
                },
              ],
              schema:
                "input AddAddressInput {\n  id: OID!\n  address: String!\n  chainId: Int!\n  label: String\n  ensName: String\n  timestamp: DateTime!\n}",
              reducer:
                "const address = action.input.address.toLowerCase();\nif (state.addresses.some((a) => a.address === address && a.chainId === action.input.chainId)) {\n  throw new AddressKnownError(`${address} on chain ${action.input.chainId} is already tracked`);\n}\nstate.addresses.push({\n  id: action.input.id,\n  address,\n  chainId: action.input.chainId,\n  label: action.input.label ?? null,\n  ensName: action.input.ensName ?? null,\n  tags: [],\n  ignored: false,\n  addedAt: action.input.timestamp,\n});",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "96a555b5-70b7-4ac4-8be7-62b7d587be0f",
              name: "UPDATE_ADDRESS",
              scope: "global",
              errors: [
                {
                  id: "625e65f3-b200-4906-ba29-53e564b37adb",
                  code: "ADDRESS_NOT_FOUND",
                  name: "AddressNotFoundError",
                  template: "",
                  description: "No tracked address with that id",
                },
              ],
              schema:
                "input UpdateAddressInput {\n  id: OID!\n  label: String\n  ensName: String\n  tags: [String!]\n}",
              reducer:
                "const entry = state.addresses.find((a) => a.id === action.input.id);\nif (!entry) throw new AddressNotFoundError(`Address ${action.input.id} is not tracked`);\nif (action.input.label != null) entry.label = action.input.label;\nif (action.input.ensName != null) entry.ensName = action.input.ensName;\nif (action.input.tags != null) entry.tags = action.input.tags;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "9628790b-2126-441d-a3ed-f22438ac812a",
              name: "REMOVE_ADDRESS",
              scope: "global",
              errors: [
                {
                  id: "b543778e-992a-4351-94d1-07060173bb03",
                  code: "ADDRESS_NOT_FOUND",
                  name: "AddressNotFoundError",
                  template: "",
                  description: "No tracked address with that id",
                },
              ],
              schema: "input RemoveAddressInput {\n  id: OID!\n}",
              reducer:
                "const index = state.addresses.findIndex((a) => a.id === action.input.id);\nif (index === -1) throw new AddressNotFoundError(`Address ${action.input.id} is not tracked`);\nstate.addresses.splice(index, 1);",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "f76aea54-283e-405a-8deb-c2e2d1a331e4",
              name: "SET_ADDRESS_IGNORED",
              scope: "global",
              errors: [
                {
                  id: "b79c5880-855b-4e89-99a9-dff61e2e63cd",
                  code: "ADDRESS_NOT_FOUND",
                  name: "AddressNotFoundError",
                  template: "",
                  description: "No tracked address with that id",
                },
              ],
              schema:
                "input SetAddressIgnoredInput {\n  id: OID!\n  ignored: Boolean!\n}",
              reducer:
                "const entry = state.addresses.find((a) => a.id === action.input.id);\nif (!entry) throw new AddressNotFoundError(`Address ${action.input.id} is not tracked`);\nentry.ignored = action.input.ignored;",
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "The tracked on-chain addresses",
        },
        {
          id: "7518f531-dc49-4f84-93e5-f6dec84175cc",
          name: "pricing",
          operations: [
            {
              id: "d291e585-a9e8-4563-81a7-26723ea343ee",
              name: "SET_PRICE_OVERRIDE",
              scope: "global",
              errors: [
                {
                  id: "6e462e8e-da6e-4aa0-a323-8c7bf56d753a",
                  code: "INVALID_AMOUNT",
                  name: "InvalidAmountError",
                  template: "",
                  description: "The price is not a decimal amount",
                },
              ],
              schema:
                "input SetPriceOverrideInput {\n  asset: String!\n  price: String!\n  setAt: DateTime!\n}",
              reducer:
                "if (!/^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(action.input.price)) {\n  throw new InvalidAmountError(`${action.input.price} is not a decimal amount`);\n}\nconst existing = state.priceOverrides.find((p) => p.asset === action.input.asset);\nif (existing) {\n  existing.price = action.input.price;\n  existing.setAt = action.input.setAt;\n} else {\n  state.priceOverrides.push({ asset: action.input.asset, price: action.input.price, setAt: action.input.setAt });\n}",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "9615ce25-c048-4d4e-a7f2-07f287db20be",
              name: "REMOVE_PRICE_OVERRIDE",
              scope: "global",
              errors: [],
              schema: "input RemovePriceOverrideInput {\n  asset: String!\n}",
              reducer:
                "state.priceOverrides = state.priceOverrides.filter((p) => p.asset !== action.input.asset);",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "fc63139e-b676-4d6f-a554-9f9d9309cbaa",
              name: "SET_ASSET_IGNORED",
              scope: "global",
              errors: [],
              schema:
                "input SetAssetIgnoredInput {\n  asset: String!\n  ignored: Boolean!\n}",
              reducer:
                "if (action.input.ignored) {\n  if (!state.ignoredAssets.includes(action.input.asset)) {\n    state.ignoredAssets.push(action.input.asset);\n  }\n} else {\n  state.ignoredAssets = state.ignoredAssets.filter((a) => a !== action.input.asset);\n}",
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "Manual price overrides and ignored assets",
        },
        {
          id: "f4407541-4864-401f-b993-72f9fef9e97c",
          name: "snapshots",
          operations: [
            {
              id: "b4033a73-9693-4d34-b4ed-f56a3ddec918",
              name: "TAKE_SNAPSHOT",
              scope: "global",
              errors: [
                {
                  id: "d948b4ad-4298-457a-a729-76af507f7474",
                  code: "EMPTY_SNAPSHOT",
                  name: "SnapshotEmptyError",
                  template: "",
                  description: "A snapshot needs at least one value",
                },
                {
                  id: "9dc93373-1e97-4eb2-b70d-f2b61f1f74e1",
                  code: "INVALID_AMOUNT",
                  name: "InvalidAmountError",
                  template: "",
                  description: "A snapshot value is not a decimal amount",
                },
              ],
              schema:
                "input TakeSnapshotInput {\n  id: OID!\n  timestamp: DateTime!\n  totalValue: String!\n  netWorth: String\n  liabilities: [SnapshotLiabilityInput!]\n  perLocation: [LocationValueInput!]!\n  perAsset: [AssetValueInput!]!\n}\n\ninput SnapshotLiabilityInput {\n  asset: String!\n  amount: String!\n}\n\ninput LocationValueInput {\n  location: String!\n  value: String!\n}\n\ninput AssetValueInput {\n  asset: String!\n  amount: String!\n  value: String!\n}",
              reducer:
                'const isDecimal = (value: string) => /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\n// Ledger-derived holdings can net negative when a wallet\'s history\n// cannot account every inflow (internal transfers are invisible\n// without traces); the snapshot records that honestly instead of\n// losing the asset.\nconst isSignedDecimal = (value: string) => /^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\nif (action.input.perLocation.length === 0 && action.input.perAsset.length === 0) {\n  throw new SnapshotEmptyError("A snapshot needs at least one location or asset value");\n}\nconst signedAmounts = [\n  action.input.totalValue,\n  ...action.input.perLocation.map((l) => l.value),\n  ...action.input.perAsset.flatMap((a) => [a.amount, a.value]),\n];\nfor (const amount of signedAmounts) {\n  if (!isSignedDecimal(amount)) throw new InvalidAmountError(`${amount} is not a decimal amount`);\n}\nfor (const liability of action.input.liabilities ?? []) {\n  if (!isDecimal(liability.amount)) throw new InvalidAmountError(`${liability.amount} is not a decimal amount`);\n}\nif (action.input.netWorth != null && !/^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(action.input.netWorth)) {\n  throw new InvalidAmountError(`${action.input.netWorth} is not a decimal amount`);\n}\nstate.snapshots.push({\n  id: action.input.id,\n  timestamp: action.input.timestamp,\n  totalValue: action.input.totalValue,\n  netWorth: action.input.netWorth ?? null,\n  liabilities: action.input.liabilities ?? [],\n  perLocation: action.input.perLocation,\n  perAsset: action.input.perAsset,\n});',
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "78ff77f7-9f8e-4083-a3a2-15e8d2457ed6",
              name: "DELETE_SNAPSHOT",
              scope: "global",
              errors: [
                {
                  id: "0f7c6b45-66cb-4c7c-a2bf-1690a5e056c7",
                  code: "SNAPSHOT_NOT_FOUND",
                  name: "SnapshotNotFoundError",
                  template: "",
                  description: "No snapshot with that id",
                },
              ],
              schema: "input DeleteSnapshotInput {\n  id: OID!\n}",
              reducer:
                "const index = state.snapshots.findIndex((s) => s.id === action.input.id);\nif (index === -1) throw new SnapshotNotFoundError(`Snapshot ${action.input.id} does not exist`);\nstate.snapshots.splice(index, 1);",
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "Stored portfolio value snapshots",
        },
        {
          id: "5f4ca700-5f3c-4546-bd98-9ef90e0408c7",
          name: "reconciler",
          operations: [
            {
              id: "561865c3-63ee-4edf-b276-96845522170b",
              name: "RECORD_RESOURCES",
              scope: "global",
              errors: [],
              schema:
                "input RecordResourcesInput {\n  connectionId: String!\n  workflowIds: [String!]!\n}",
              reducer:
                "state.resources = {\n  connectionId: action.input.connectionId,\n  workflowIds: action.input.workflowIds,\n};",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "62014805-62df-4e90-8d2f-1a89a14c083f",
              name: "RECORD_CHECK",
              scope: "global",
              errors: [],
              schema:
                "input RecordCheckInput {\n  at: DateTime!\n  issues: [IssueInput!]!\n  fixes: [FixInput!]!\n}\n\ninput IssueInput {\n  code: String!\n  severity: IssueSeverity!\n  message: String!\n  accountId: String\n}\n\ninput FixInput {\n  code: String!\n  message: String!\n  at: DateTime!\n}",
              reducer:
                "state.lastCheck = {\n  at: action.input.at,\n  issues: action.input.issues.map((i) => ({\n    code: i.code,\n    severity: i.severity,\n    message: i.message,\n    accountId: i.accountId ?? null,\n  })),\n  fixes: action.input.fixes,\n};",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "58ba85a8-4492-4132-94a2-dc64ea56d97a",
              name: "SET_GRANT",
              scope: "global",
              errors: [],
              schema:
                "input SetGrantInput {\n  id: String!\n  name: String\n  grantedAt: DateTime\n}",
              reducer:
                "state.grant = {\n  id: action.input.id,\n  name: action.input.name ?? null,\n  grantedAt: action.input.grantedAt ?? null,\n};",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "dd0a6167-420b-40d2-b2d7-076526c452ee",
              name: "CLEAR_GRANT",
              scope: "global",
              errors: [],
              schema: "input ClearGrantInput {\n  _empty: Boolean\n}",
              reducer: "state.grant = null;",
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "What the reconciler manages and last observed",
        },
        {
          id: "a08bbd13-0901-4007-8b3b-55ea20f649a7",
          name: "positions",
          operations: [
            {
              id: "16fbc77b-6071-41d7-a0d5-641af3cbf5e3",
              name: "SET_POSITIONS",
              scope: "global",
              errors: [],
              schema:
                "input SetPositionsInput {\n  wallet: String!\n  chainId: Int!\n  fetchedAt: DateTime!\n  positions: [PositionInput!]!\n}\n\ninput PositionInput {\n  protocol: String!\n  kind: PositionKind!\n  assets: [PositionAssetInput!]!\n  note: String\n}\n\ninput PositionAssetInput {\n  asset: String!\n  amount: String!\n}",
              reducer:
                "const entry = {\n  wallet: action.input.wallet,\n  chainId: action.input.chainId,\n  fetchedAt: action.input.fetchedAt,\n  positions: action.input.positions,\n};\nconst index = state.positions.findIndex(\n  (p) => p.wallet === action.input.wallet && p.chainId === action.input.chainId,\n);\nif (index === -1) {\n  state.positions.push(entry);\n} else {\n  state.positions[index] = entry;\n};",
              examples: [],
              template: "",
              description: "",
            },
          ],
          description: "On-chain DeFi positions per wallet and chain",
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
