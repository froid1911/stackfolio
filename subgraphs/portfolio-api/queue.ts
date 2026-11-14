/**
 * The review queue: UNCLASSIFIED legs grouped by who was on the other side
 * and which way value moved, largest EUR value first, so one decision (a
 * rule, or a category for the group) settles many rows.
 */
import { txHashOf } from "../../processors/shared/categories.js";

export interface QueueLeg {
  wallet: string;
  eventId: string;
  sequenceIndex: number;
  eventIdentifier: string;
  type: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  price: string | null;
  priceUnit: string | null;
}

export interface QueueGroup {
  counterparty: string | null;
  direction: "IN" | "OUT";
  count: number;
  value: string | null;
  assets: string[];
  suspectedAirdrop: boolean;
  /** Event keys "wallet|eventId|sequenceIndex", at most MAX_EVENTS. */
  events: string[];
}

const SCALE = 10n ** 8n;
export const MAX_EVENTS = 500;

/** EUR value scaled by 1e8, or null when the leg has no EUR price. */
function legValue(leg: QueueLeg, decimals: Map<string, number>): bigint | null {
  const places = decimals.get(leg.asset);
  if (leg.price === null || leg.priceUnit !== "EUR" || places === undefined) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(leg.price);
  if (!match) return null;
  const price = BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(8, "0").slice(0, 8));
  return (BigInt(leg.amount) * price) / 10n ** BigInt(places);
}

function format(scaled: bigint): string {
  const whole = scaled / SCALE;
  const fraction = (scaled % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Group the queue's legs. `signed` holds "wallet|txHash" for transactions a
 * wallet paid gas for: an inbound group none of whose legs was signed, all
 * priced, from an address, is a suspected airdrop.
 */
export function queueGroups(
  legs: QueueLeg[],
  signed: Set<string>,
  decimals: Map<string, number>,
): { total: number; value: string | null; groups: QueueGroup[] } {
  const groups = new Map<string, QueueGroup & { scaled: bigint | null; pushed: boolean }>();
  let total: bigint | null = null;
  for (const leg of legs) {
    const direction = leg.type === "SPEND" ? "OUT" : "IN";
    const counterparty = leg.counterparty?.toLowerCase() ?? null;
    const id = `${counterparty ?? ""}|${direction}`;
    const group = groups.get(id) ?? {
      counterparty,
      direction,
      count: 0,
      value: null,
      assets: [],
      suspectedAirdrop: false,
      events: [],
      scaled: null,
      pushed: true,
    };
    group.count += 1;
    if (!group.assets.includes(leg.asset)) group.assets.push(leg.asset);
    if (group.events.length < MAX_EVENTS) {
      group.events.push(`${leg.wallet}|${leg.eventId}|${leg.sequenceIndex}`);
    }
    const value = legValue(leg, decimals);
    if (value === null || signed.has(`${leg.wallet}|${txHashOf(leg.eventIdentifier)}`)) {
      group.pushed = false;
    }
    if (value !== null) {
      group.scaled = (group.scaled ?? 0n) + value;
      total = (total ?? 0n) + value;
    }
    groups.set(id, group);
  }
  const list = [...groups.values()].map(({ scaled, pushed, ...group }) => ({
    group: {
      ...group,
      value: scaled === null ? null : format(scaled),
      suspectedAirdrop:
        pushed && group.direction === "IN" && group.counterparty?.startsWith("0x") === true,
    },
    sort: scaled ?? -1n,
  }));
  list.sort((a, b) =>
    a.sort === b.sort ? b.group.count - a.group.count : a.sort > b.sort ? -1 : 1,
  );
  return {
    total: legs.length,
    value: total === null ? null : format(total),
    groups: list.map((entry) => entry.group),
  };
}
