export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: `${string}:0x${string}`; output: `${string}:0x${string}` };
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Currency: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  AttachmentRef: {
    input: `attachment://v${number}:${string}`;
    output: `attachment://v${number}:${string}`;
  };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
  Upload: { input: File; output: File };
};

export type ChainManifest = {
  chainId: Scalars["Int"]["output"];
  contracts: Array<ContractRef>;
  events: Array<EventRule>;
};

export type ChainManifestInput = {
  chainId: Scalars["Int"]["input"];
  contracts: Array<ContractRefInput>;
  events: Array<EventRuleInput>;
};

export type ContractKind = "CORE" | "DEBT" | "POSITION";

export type ContractRef = {
  address: Scalars["String"]["output"];
  kind: ContractKind;
  name: Scalars["String"]["output"];
  underlying: Maybe<Scalars["String"]["output"]>;
};

export type ContractRefInput = {
  address: Scalars["String"]["input"];
  kind: ContractKind;
  name: Scalars["String"]["input"];
  underlying?: InputMaybe<Scalars["String"]["input"]>;
};

export type EventRule = {
  name: Scalars["String"]["output"];
  semantic: EventSemantic;
  topic: Scalars["String"]["output"];
};

export type EventRuleInput = {
  name: Scalars["String"]["input"];
  semantic: EventSemanticInput;
  topic: Scalars["String"]["input"];
};

export type EventSemantic = {
  subtype: Scalars["String"]["output"];
  type: Scalars["String"]["output"];
};

export type EventSemanticInput = {
  subtype: Scalars["String"]["input"];
  type: Scalars["String"]["input"];
};

export type ProtocolEntry = {
  chains: Array<ChainManifest>;
  id: Scalars["String"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  plugins: Array<Scalars["String"]["output"]>;
  status: ProtocolStatus;
  updatedAt: Maybe<Scalars["DateTime"]["output"]>;
};

export type ProtocolEntryInput = {
  chains: Array<ChainManifestInput>;
  id: Scalars["String"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
  plugins?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type ProtocolRegistryState = {
  protocols: Array<ProtocolEntry>;
};

export type ProtocolStatus = "ACTIVE" | "RETIRED";

export type RegisterProtocolInput = {
  entry: ProtocolEntryInput;
  updatedAt: Scalars["DateTime"]["input"];
};

export type RetireProtocolInput = {
  id: Scalars["String"]["input"];
  updatedAt: Scalars["DateTime"]["input"];
};

export type UpdateProtocolInput = {
  entry: ProtocolEntryInput;
  updatedAt: Scalars["DateTime"]["input"];
};
