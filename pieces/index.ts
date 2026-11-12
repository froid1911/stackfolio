import type { PackagePiece } from "@powerhousedao/pieces-framework";

/** The pieces this package ships: what each is called and where the node
 * build emits its module. A piece's version is this package's. */
export const pieces: PackagePiece[] = [
  {
    name: "@powerhousedao/ethereum-piece",
    entry: "dist/node/pieces/ethereum/index.mjs",
  },
];

export default pieces;
