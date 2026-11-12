import type { ReceiptLike } from "../protocol-decode.js";
import type { EventRow } from "../types.js";

/** Everything a plugin may look at. `legs` are the account's plain Transfer
 * rows for the receipt — the same rows a generic import would book — so a
 * plugin can annotate them or replace them wholesale. */
export interface PluginInput {
  receipt: ReceiptLike;
  /** Lowercase account address. */
  account: string;
  chainId: number;
  legs: EventRow[];
}

/** Rows the protocol claims for the receipt, or null to fall back to the
 * manifest's declarative attach rules. */
export type PluginOutput = EventRow[] | null;

export type ProtocolPlugin = (input: PluginInput) => PluginOutput;

/**
 * Protocol decoders that need more than "match a topic, tag a leg" — hidden
 * amounts (Uniswap V3), multi-event state machines (Morpho liquidations).
 * A manifest naming a plugin here that this map lacks makes the protocol
 * inert: the engine drops its rows rather than guess (see protocol-decode).
 *
 * The launch set decodes declaratively, so the map starts empty; adding one
 * means adding an entry and naming it in the manifest's `plugins`.
 */
export const PLUGIN: Readonly<Record<string, ProtocolPlugin>> = {};
