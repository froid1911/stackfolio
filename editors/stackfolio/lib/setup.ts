/**
 * The three documents every portfolio drive holds. Setup adopts what the
 * drive already has and creates only the rest; the ledger views refuse to
 * render without them.
 */
export type SingletonKey = "portfolio" | "registry" | "priceBook";

export interface DriveNodeLite {
  kind: "file" | "folder";
  id: string;
}

export interface SetupPlan {
  existing: Record<SingletonKey, string | null>;
  /** The singletons the drive is missing, in creation order. */
  toCreate: SingletonKey[];
  ready: boolean;
}

const SINGLETONS: readonly [SingletonKey, string][] = [
  ["portfolio", "stackfolio/portfolio"],
  ["registry", "stackfolio/asset-registry"],
  ["priceBook", "stackfolio/price-book"],
];

/**
 * Which singletons the drive has, and which it lacks. `typeOf` answers a
 * node id with its document type (undefined while a document is still
 * loading, which counts as absent: setup would adopt it on the next pass).
 */
export function planSetup(
  nodes: DriveNodeLite[],
  typeOf: (id: string) => string | undefined,
): SetupPlan {
  const existing: Record<SingletonKey, string | null> = {
    portfolio: null,
    registry: null,
    priceBook: null,
  };
  for (const node of nodes) {
    if (node.kind !== "file") continue;
    const type = typeOf(node.id);
    for (const [key, documentType] of SINGLETONS) {
      if (existing[key] === null && type === documentType) {
        existing[key] = node.id;
      }
    }
  }
  const toCreate = SINGLETONS.filter(
    ([key]) => existing[key] === null,
  ).map(([key]) => key);
  return { existing, toCreate, ready: toCreate.length === 0 };
}
