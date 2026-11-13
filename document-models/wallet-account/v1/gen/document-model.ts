import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stackfolio/wallet-account",
  name: "Wallet Account",
  author: {
    name: "Stackfolio",
    website: "https://github.com/froid1911/stackfolio",
  },
  extension: ".wallet",
  description:
    "One on-chain account: its event ledger, scan cursor, backfill progress and latest native balance.",
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
            "type WalletAccountState {\n  address: String!\n  chainId: Int!\n  label: String\n  ignored: Boolean!\n  ledger: [LedgerEvent!]!\n  cursor: ScanCursor\n  backfill: BackfillState\n  redecode: BackfillState\n  nativeBalance: NativeBalance\n  bitcoinXpub: String\n  ensNames: [EnsName!]!\n}\n\ntype LedgerEvent {\n  id: OID!\n  eventIdentifier: String!\n  sequenceIndex: Int!\n  timestamp: DateTime!\n  type: EventType!\n  subtype: EventSubtype!\n  asset: String!\n  amount: String!\n  counterparty: String\n  counterpartyLabel: String\n  notes: String\n  ignored: Boolean!\n  source: EventSource!\n  importBatch: String\n  valuation: Valuation\n}\n\ntype Valuation {\n  unit: String!\n  price: String!\n  source: ValuationSource!\n  granularity: ValuationGranularity!\n  pinnedAt: DateTime!\n}\n\ntype EnsName {\n  name: String!\n  owned: Boolean!\n}\n\ntype ScanCursor {\n  lastLogsBlock: Int\n  lastNativeScanBlock: Int\n  lastEventTimestamp: DateTime\n  lastRunAt: DateTime\n}\n\ntype BackfillState {\n  state: BackfillPhase!\n  startBlock: Int\n  nextBlock: Int\n}\n\ntype NativeBalance {\n  amount: String!\n  blockNumber: Int!\n  observedAt: DateTime!\n}\n\nenum EventType {\n  SPEND\n  RECEIVE\n  TRADE\n  TRANSFER\n  STAKING\n  MIGRATE\n  INFORMATIONAL\n}\n\nenum EventSubtype {\n  NONE\n  FEE\n  APPROVE\n  WITHDRAWAL\n  BLOCK_PRODUCTION\n  SPAM\n  AIRDROP\n  DONATE\n  DEPOSIT_ASSET\n  REMOVE_ASSET\n  BORROW\n  REPAY\n  LIQUIDATION\n  YIELD\n  LP_MINT\n  LP_BURN\n  NAME_REGISTRATION\n  BRIDGE\n}\n\nenum EventSource {\n  CHAIN\n  MANUAL\n}\n\nenum ValuationSource {\n  COINGECKO\n  DEFILLAMA\n  MANUAL\n  UNPRICED\n}\n\nenum ValuationGranularity {\n  DAY\n  NONE\n}\n\nenum BackfillPhase {\n  IDLE\n  LOGS\n  NATIVE\n  DONE\n}",
          examples: [],
          initialValue:
            '{"address":"","chainId":0,"label":null,"ignored":false,"ledger":[],"cursor":null,"backfill":null,"redecode":null,"nativeBalance":null,"bitcoinXpub":null,"ensNames":[]}',
        },
      },
      modules: [
        {
          id: "5235253e-4b48-4a96-812f-cd5a00446ac3",
          name: "account",
          operations: [
            {
              id: "34a57cf2-41c3-4837-b0b2-c1c9fcfa7333",
              name: "SET_ACCOUNT_DETAILS",
              scope: "global",
              errors: [],
              schema:
                "input SetAccountDetailsInput {\n  address: String\n  chainId: Int\n  label: String\n}",
              reducer:
                "if (action.input.address != null) state.address = action.input.address.toLowerCase();\nif (action.input.chainId != null) state.chainId = action.input.chainId;\nif (action.input.label != null) state.label = action.input.label;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "44c762c1-8108-4719-8f92-e184cdeb0213",
              name: "SET_IGNORED",
              scope: "global",
              errors: [],
              schema: "input SetIgnoredInput {\n  ignored: Boolean!\n}",
              reducer: "state.ignored = action.input.ignored;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "setWalletXpub",
              name: "SET_WALLET_XPUB",
              scope: "global",
              errors: [
                {
                  id: "setWalletXpubInvalid",
                  code: "INVALID_INPUT",
                  name: "InvalidInputError",
                  template: "",
                  description:
                    "The value is not a base58 extended public key with a recognised prefix.",
                },
              ],
              schema: "input SetWalletXpubInput {\n  xpub: String\n}",
              reducer:
                'if (action.input.xpub == null) {\n  state.bitcoinXpub = null;\n} else {\n  const xpub = action.input.xpub.trim();\n  if (!/^(xpub|tpub|vpub|uppub|zpub|Zpub|Ypub)[1-9A-HJ-NP-Za-km-z]{20,}$/.test(xpub)) {\n    throw new InvalidInputError("xpub must be an extended public key: xpub/tpub/vpub/uppub/zpub/Zpub/Ypub in base58");\n  }\n  state.bitcoinXpub = xpub;\n}',
              examples: [],
              template:
                "Attach (or clear) the watch-only extended public key of a Bitcoin wallet (chainId 0).",
              description:
                "Attach (or clear) the watch-only extended public key of a Bitcoin wallet (chainId 0).",
            },
            {
              id: "setEnsNames",
              name: "SET_ENS_NAMES",
              scope: "global",
              errors: [],
              schema:
                "input SetEnsNamesInput {\n  names: [EnsNameInput!]!\n}\n\ninput EnsNameInput {\n  name: String!\n  owned: Boolean!\n}",
              reducer:
                "state.ensNames = action.input.names.map((entry) => ({\n  name: entry.name.toLowerCase(),\n  owned: entry.owned,\n}));",
              examples: [
                {
                  id: "ensExample1",
                  value: '{"names":[{"name":"frankp.eth","owned":true}]}',
                },
              ],
              template: "Record the ENS names for this wallet.",
              description:
                "Full replace of the ENS names associated with this wallet, each marked owned when forward resolution points back to the address.",
            },
          ],
          description: "Address, chain, label and the ignored switch",
        },
        {
          id: "37345257-1f34-4c33-a60d-bcdf5bc8fe23",
          name: "feed",
          operations: [
            {
              id: "24115b6d-5eec-42bb-8c0f-e2b4d2d79cbd",
              name: "IMPORT_EVENTS",
              scope: "global",
              errors: [
                {
                  id: "d08c7a42-b8ec-42fe-9ef0-ad83900b788d",
                  code: "EMPTY_IMPORT",
                  name: "EmptyImportError",
                  template: "",
                  description: "An import batch must carry at least one event",
                },
                {
                  id: "edbd5ddc-77d2-477c-a5d8-5fcf4507ab72",
                  code: "DUPLICATE_EVENT",
                  name: "DuplicateEventError",
                  template: "",
                  description:
                    "An event with the same identifier and sequence index exists",
                },
                {
                  id: "0464a456-4b19-4787-bf4a-138ca28d4890",
                  code: "INVALID_AMOUNT",
                  name: "InvalidAmountError",
                  template: "",
                  description: "An event amount is not a decimal",
                },
              ],
              schema:
                "input ImportEventsInput {\n  batchId: String!\n  importedAt: DateTime!\n  events: [ImportedEventInput!]!\n}\n\ninput ImportedEventInput {\n  id: OID!\n  eventIdentifier: String!\n  sequenceIndex: Int!\n  timestamp: DateTime!\n  type: EventType!\n  subtype: EventSubtype!\n  asset: String!\n  amount: String!\n  counterparty: String\n  notes: String\n  valuation: ValuationInput\n}\n\ninput ValuationInput {\n  unit: String!\n  price: String!\n  source: ValuationSource!\n  granularity: ValuationGranularity!\n  pinnedAt: DateTime!\n}",
              reducer:
                'if (action.input.events.length === 0) {\n  throw new EmptyImportError("An import batch must carry at least one event");\n}\nconst isDecimal = (value: string) => /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\nconst seen = new Set(state.ledger.map((e) => `${e.eventIdentifier}#${e.sequenceIndex}`));\nfor (const event of action.input.events) {\n  if (!isDecimal(event.amount)) {\n    throw new InvalidAmountError(`${event.amount} is not a decimal amount`);\n  }\n  const key = `${event.eventIdentifier}#${event.sequenceIndex}`;\n  if (seen.has(key)) {\n    throw new DuplicateEventError(\n      `Event ${event.eventIdentifier}#${event.sequenceIndex} already imported`,\n    );\n  }\n  seen.add(key);\n}\nfor (const event of action.input.events) {\n  state.ledger.push({\n    id: event.id,\n    eventIdentifier: event.eventIdentifier,\n    sequenceIndex: event.sequenceIndex,\n    timestamp: event.timestamp,\n    type: event.type,\n    subtype: event.subtype,\n    asset: event.asset,\n    amount: event.amount,\n    counterparty: event.counterparty ?? null,\n    counterpartyLabel: null,\n    notes: event.notes ?? null,\n    ignored: false,\n    source: "CHAIN",\n    importBatch: action.input.batchId,\n  });\n}',
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "replaceEvents",
              name: "REPLACE_EVENTS",
              scope: "global",
              errors: [
                {
                  id: "replaceEmpty",
                  name: "EmptyReplacementError",
                  code: "INVALID_INPUT",
                  description:
                    "A replacement must remove or add at least one event.",
                  template: "",
                },
                {
                  id: "replaceInvalidAmount",
                  name: "InvalidAmountError",
                  code: "INVALID_AMOUNT",
                  description: "An added event amount is not a decimal.",
                  template: "",
                },
              ],
              schema:
                "input ReplaceEventsInput {\n  batchId: String!\n  remove: [EventLocatorInput!]!\n  add: [ImportedEventInput!]!\n}\n\ninput EventLocatorInput {\n  id: OID!\n  sequenceIndex: Int!\n}\n\ninput ImportedEventInput {\n  id: OID!\n  eventIdentifier: String!\n  sequenceIndex: Int!\n  timestamp: DateTime!\n  type: EventType!\n  subtype: EventSubtype!\n  asset: String!\n  amount: String!\n  counterparty: String\n  notes: String\n  valuation: ValuationInput\n}\n\ninput ValuationInput {\n  unit: String!\n  price: String!\n  source: ValuationSource!\n  granularity: ValuationGranularity!\n  pinnedAt: DateTime!\n}",
              reducer:
                'if (action.input.remove.length === 0 && action.input.add.length === 0) {\n  throw new EmptyReplacementError("A replacement must remove or add at least one event");\n}\nconst isDecimal = (value) => /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\nfor (const event of action.input.add) {\n  if (!isDecimal(event.amount)) {\n    throw new InvalidAmountError(event.amount + " is not a decimal amount");\n  }\n}\nconst removeKeys = {};\nfor (const entry of action.input.remove) {\n  removeKeys[entry.id + "-" + entry.sequenceIndex] = true;\n}\nconst carried = {};\nconst kept = [];\nfor (const event of state.ledger) {\n  const key = event.id + "-" + event.sequenceIndex;\n  if (removeKeys[key]) {\n    carried[key] = {\n      ignored: event.ignored,\n      notes: event.notes,\n      counterpartyLabel: event.counterpartyLabel,\n    };\n    continue;\n  }\n  kept.push(event);\n}\nconst surviving = {};\nfor (const event of kept) {\n  surviving[event.eventIdentifier + "#" + event.sequenceIndex] = true;\n}\nstate.ledger.length = 0;\nfor (const event of kept) state.ledger.push(event);\nfor (const input of action.input.add) {\n  const dedupKey = input.eventIdentifier + "#" + input.sequenceIndex;\n  if (surviving[dedupKey]) continue;\n  surviving[dedupKey] = true;\n  const carry = carried[input.id + "-" + input.sequenceIndex] || {};\n  state.ledger.push({\n    id: input.id,\n    eventIdentifier: input.eventIdentifier,\n    sequenceIndex: input.sequenceIndex,\n    timestamp: input.timestamp,\n    type: input.type,\n    subtype: input.subtype,\n    asset: input.asset,\n    amount: input.amount,\n    counterparty: input.counterparty ?? null,\n    counterpartyLabel: carry.counterpartyLabel ?? null,\n    notes: carry.notes ?? input.notes ?? null,\n    ignored: carry.ignored ?? false,\n    valuation: input.valuation ?? null,\n    source: "CHAIN",\n    importBatch: action.input.batchId,\n  });\n}',
              examples: [],
              template: "Replace decoded generic rows with semantic rows.",
              description:
                "Atomically remove ledger rows and import their semantic replacements, carrying review overrides (ignored, notes, counterparty labels) onto rows with the same id.",
            },
          ],
          description: "Batch imports of decoded chain events",
        },
        {
          id: "52d11024-3471-4cd6-aac1-fd55b0deb42e",
          name: "review",
          operations: [
            {
              id: "88b347ba-a1ff-439f-9218-6d84f03c18b8",
              name: "SET_EVENT_IGNORED",
              scope: "global",
              errors: [
                {
                  id: "3a659ecc-c891-4375-bdda-6ab534dac6d4",
                  code: "EVENT_NOT_FOUND",
                  name: "EventNotFoundError",
                  template: "",
                  description: "No ledger event with that id",
                },
              ],
              schema:
                "input SetEventIgnoredInput {\n  id: OID!\n  ignored: Boolean!\n}",
              reducer:
                "const event = state.ledger.find((e) => e.id === action.input.id);\nif (!event) throw new EventNotFoundError(`Event ${action.input.id} is not in the ledger`);\nevent.ignored = action.input.ignored;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "bf7a03e8-c73d-4491-b588-7c293f6c8cf0",
              name: "SET_EVENT_NOTES",
              scope: "global",
              errors: [
                {
                  id: "ec2bfc77-72f0-4c65-a092-470096973cd9",
                  code: "EVENT_NOT_FOUND",
                  name: "EventNotFoundError",
                  template: "",
                  description: "No ledger event with that id",
                },
              ],
              schema:
                "input SetEventNotesInput {\n  id: OID!\n  notes: String\n}",
              reducer:
                "const event = state.ledger.find((e) => e.id === action.input.id);\nif (!event) throw new EventNotFoundError(`Event ${action.input.id} is not in the ledger`);\nevent.notes = action.input.notes ?? null;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "82f76687-8e06-4aef-930e-ecf7efca0b0b",
              name: "RETYPE_EVENT",
              scope: "global",
              errors: [
                {
                  id: "f3f38dd8-aa05-44a2-bdf2-f08282136c0d",
                  code: "EVENT_NOT_FOUND",
                  name: "EventNotFoundError",
                  template: "",
                  description: "No ledger event with that id",
                },
              ],
              schema:
                "input RetypeEventInput {\n  id: OID!\n  type: EventType!\n  subtype: EventSubtype!\n}",
              reducer:
                "const event = state.ledger.find((e) => e.id === action.input.id);\nif (!event) throw new EventNotFoundError(`Event ${action.input.id} is not in the ledger`);\nevent.type = action.input.type;\nevent.subtype = action.input.subtype;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "pinValuations",
              name: "PIN_VALUATIONS",
              scope: "global",
              errors: [
                {
                  id: "pinValuationsInvalid",
                  name: "InvalidValuationError",
                  code: "INVALID_INPUT",
                  description: "A valuation lacks a decimal price or a unit.",
                  template: "",
                },
              ],
              schema:
                "input PinValuationsInput {\n  events: [PinValuationInput!]!\n}\n\ninput PinValuationInput {\n  id: OID!\n  sequenceIndex: Int!\n  valuation: ValuationInput!\n}\n\ninput ValuationInput {\n  unit: String!\n  price: String!\n  source: ValuationSource!\n  granularity: ValuationGranularity!\n  pinnedAt: DateTime!\n}",
              reducer:
                'const isDecimal = (value) => /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\nconst wanted = {};\nfor (const pin of action.input.events) {\n  if (!isDecimal(pin.valuation.price) || !pin.valuation.unit) {\n    throw new InvalidValuationError("valuation needs a decimal price and a unit");\n  }\n  const key = pin.id + "-" + pin.sequenceIndex;\n  if (!wanted[key]) wanted[key] = pin.valuation;\n}\nfor (const event of state.ledger) {\n  const valuation = wanted[event.id + "-" + event.sequenceIndex];\n  if (!valuation) continue;\n  if (event.valuation && event.valuation.source === "MANUAL" && valuation.source !== "MANUAL") {\n    continue;\n  }\n  event.valuation = {\n    unit: valuation.unit,\n    price: valuation.price,\n    source: valuation.source,\n    granularity: valuation.granularity,\n    pinnedAt: valuation.pinnedAt,\n  };\n}',
              examples: [
                {
                  id: "pinExample1",
                  value:
                    '{"events":[{"id":"4f4e06f2-8b5a-4d7e-9b52-c2f1d2e7a101","sequenceIndex":0,"valuation":{"unit":"EUR","price":"3000.00","source":"COINGECKO","granularity":"DAY","pinnedAt":"2026-11-12T00:00:00.000Z"}}]}',
                },
              ],
              template: "Pin oracle or manual prices onto ledger events.",
              description:
                "Attach daily-close valuations to ledger events by id and sequence index; manual valuations are never overwritten by oracles.",
            },
          ],
          description: "Human corrections on ledger events",
        },
        {
          id: "5c037d92-472d-4dc0-aba5-dd9386a39dd4",
          name: "cursor",
          operations: [
            {
              id: "8cd147ca-4582-4b86-b10f-883ae8127c03",
              name: "RECORD_SCAN_PROGRESS",
              scope: "global",
              errors: [
                {
                  id: "caf51411-ed1a-441a-94da-fdd4fef0f2a8",
                  code: "CURSOR_REGRESSION",
                  name: "CursorRegressionError",
                  template: "",
                  description: "A scan cursor must never move backwards",
                },
              ],
              schema:
                "input RecordScanProgressInput {\n  lastLogsBlock: Int\n  lastNativeScanBlock: Int\n  lastEventTimestamp: DateTime\n  ranAt: DateTime!\n}",
              reducer:
                "const cursor = state.cursor ?? {\n  lastLogsBlock: null,\n  lastNativeScanBlock: null,\n  lastEventTimestamp: null,\n  lastRunAt: null,\n};\nif (\n  action.input.lastLogsBlock != null &&\n  cursor.lastLogsBlock != null &&\n  action.input.lastLogsBlock < cursor.lastLogsBlock\n) {\n  throw new CursorRegressionError(\n    `lastLogsBlock would regress from ${cursor.lastLogsBlock} to ${action.input.lastLogsBlock}`,\n  );\n}\nif (\n  action.input.lastNativeScanBlock != null &&\n  cursor.lastNativeScanBlock != null &&\n  action.input.lastNativeScanBlock < cursor.lastNativeScanBlock\n) {\n  throw new CursorRegressionError(\n    `lastNativeScanBlock would regress from ${cursor.lastNativeScanBlock} to ${action.input.lastNativeScanBlock}`,\n  );\n}\nif (action.input.lastLogsBlock != null) cursor.lastLogsBlock = action.input.lastLogsBlock;\nif (action.input.lastNativeScanBlock != null) cursor.lastNativeScanBlock = action.input.lastNativeScanBlock;\nif (action.input.lastEventTimestamp != null) cursor.lastEventTimestamp = action.input.lastEventTimestamp;\ncursor.lastRunAt = action.input.ranAt;\nstate.cursor = cursor;",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "55ec35cf-6719-4c72-b61c-eba5f9a6c155",
              name: "SET_BACKFILL_STATE",
              scope: "global",
              errors: [],
              schema:
                "input SetBackfillStateInput {\n  state: BackfillPhase!\n  startBlock: Int\n  nextBlock: Int\n}",
              reducer:
                "state.backfill = {\n  state: action.input.state,\n  startBlock: action.input.startBlock ?? null,\n  nextBlock: action.input.nextBlock ?? null,\n};",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "c485f6de-deb6-48b1-b7d0-ea30f55f7387",
              name: "SET_NATIVE_BALANCE",
              scope: "global",
              errors: [
                {
                  id: "396bafba-ccdd-4b52-a8ac-93c12b140ca3",
                  code: "BALANCE_STALE",
                  name: "BalanceStaleError",
                  template: "",
                  description:
                    "The observation is not newer than the stored balance",
                },
              ],
              schema:
                "input SetNativeBalanceInput {\n  amount: String!\n  blockNumber: Int!\n  observedAt: DateTime!\n}",
              reducer:
                "if (\n  state.nativeBalance &&\n  action.input.observedAt <= state.nativeBalance.observedAt\n) {\n  throw new BalanceStaleError(\n    `A balance observed at ${action.input.observedAt} is not newer than ${state.nativeBalance.observedAt}`,\n  );\n}\nstate.nativeBalance = {\n  amount: action.input.amount,\n  blockNumber: action.input.blockNumber,\n  observedAt: action.input.observedAt,\n};",
              examples: [],
              template: "",
              description: "",
            },
            {
              id: "setRedecodeState",
              name: "SET_REDECODE_STATE",
              description:
                "The re-walk cursor that re-decodes an imported history against the protocol registry; DONE retires the retrofit.",
              schema:
                "input SetRedecodeStateInput {\n  state: BackfillPhase!\n  startBlock: Int\n  nextBlock: Int\n}",
              template: "Set the re-decode walk cursor.",
              reducer:
                "state.redecode = {\n  state: action.input.state,\n  startBlock: action.input.startBlock ?? null,\n  nextBlock: action.input.nextBlock ?? null,\n};",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
          description: "Scan progress, backfill phase and native balance",
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
