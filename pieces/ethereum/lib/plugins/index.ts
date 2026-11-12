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
 * A plugin that returns null falls through to the manifest's declarative
 * rules — naming such a plugin in a manifest is how a protocol declares
 * "I am understood" while its positions reader (fetch-positions gates the
 * money-market walk on the name) still gets its signal.
 */
export const PLUGIN: Readonly<Record<string, ProtocolPlugin>> = {
  // Aave books entirely by event rule (Supply/Borrow/Repay/Withdraw attach
  // their legs); the name exists so the manifest can carry the
  // fetch-positions gate without making the decoder inert.
  "aave-v3": () => null,
};
