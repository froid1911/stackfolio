/**
 * Protocol manifests: the data form of the `stackfolio/protocol-registry`
 * document. `parseProtocolEntry` validates whatever JSON a registry document
 * holds into a typed manifest — malformed entries become `null`, never a
 * throw, so one bad manifest can't break an import page.
 */
import { z } from "zod";

/** Event types the ledger accepts (mirror of wallet-account EventType). */
export const EVENT_TYPES = [
  "SPEND",
  "RECEIVE",
  "TRADE",
  "TRANSFER",
  "STAKING",
  "MIGRATE",
  "INFORMATIONAL",
] as const;

/**
 * Event subtypes, including the protocol subtypes the ledger schema gains in
 * this feature. The registry validates against this superset; the wallet
 * document still rejects any subtype its schema doesn't know.
 */
export const EVENT_SUBTYPES = [
  "NONE",
  "FEE",
  "APPROVE",
  "WITHDRAWAL",
  "BLOCK_PRODUCTION",
  "SPAM",
  "AIRDROP",
  "DONATE",
  "DEPOSIT_ASSET",
  "REMOVE_ASSET",
  "BORROW",
  "REPAY",
  "LIQUIDATION",
  "YIELD",
  "LP_MINT",
  "LP_BURN",
  "NAME_REGISTRATION",
  "BRIDGE",
] as const;

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase());
const topic = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase());

const contractSchema = z.object({
  name: z.string(),
  address,
  kind: z.enum(["CORE", "POSITION", "DEBT"]),
  underlying: z.string().nullish(),
});
export type ContractRef = z.infer<typeof contractSchema>;

const eventSchema = z.object({
  topic,
  name: z.string(),
  semantic: z.object({
    type: z.enum(EVENT_TYPES),
    subtype: z.enum(EVENT_SUBTYPES),
  }),
  /** Canonical event ABI fragment; present on seeds so tests can recompute
   * the topic hash and catch a wrong topic at build time. */
  abi: z.string().optional(),
});
export type EventRule = z.infer<typeof eventSchema>;
export type EventSemantic = EventRule["semantic"];

const chainSchema = z.object({
  chainId: z.number().int(),
  contracts: z.array(contractSchema),
  events: z.array(eventSchema),
});
export type ChainManifest = z.infer<typeof chainSchema>;

const entrySchema = z.object({
  id: z.string(),
  status: z.enum(["ACTIVE", "RETIRED"]).default("ACTIVE"),
  chains: z.array(chainSchema),
  plugins: z.array(z.string()).default([]),
});
export type ProtocolManifest = z.infer<typeof entrySchema>;

/** Validate a registry-document entry; null on any malformation. */
export function parseProtocolEntry(json: unknown): ProtocolManifest | null {
  const result = entrySchema.safeParse(json);
  return result.success ? result.data : null;
}

export interface ChainIndex {
  protocols: ProtocolManifest[];
  contracts: ContractRef[];
  events: EventRule[];
}

/** Validate and flatten ACTIVE manifests that carry the chain; anything
 * malformed, retired or on another chain drops out. */
export function manifestForChain(
  entries: unknown[],
  chainId: number,
): ChainIndex {
  const protocols: ProtocolManifest[] = [];
  const contracts: ContractRef[] = [];
  const events: EventRule[] = [];
  for (const raw of entries) {
    const manifest = parseProtocolEntry(raw);
    if (!manifest || manifest.status !== "ACTIVE") continue;
    const chain = manifest.chains.find((entry) => entry.chainId === chainId);
    if (!chain) continue;
    protocols.push(manifest);
    contracts.push(...chain.contracts);
    events.push(...chain.events);
  }
  return { protocols, contracts, events };
}
