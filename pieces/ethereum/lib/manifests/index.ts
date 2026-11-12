export { aaveV3 } from "./aave-v3.js";
export { sky } from "./sky.js";
export { uniswapV2 } from "./uniswap-v2.js";
export { uniswapV3 } from "./uniswap-v3.js";
export { ens } from "./ens.js";

import { aaveV3 } from "./aave-v3.js";
import { ens } from "./ens.js";
import { sky } from "./sky.js";
import { uniswapV2 } from "./uniswap-v2.js";
import { uniswapV3 } from "./uniswap-v3.js";
import type { ProtocolManifest } from "../manifest.js";

/** The launch set, in the order the registry document should seed them. */
export const SEED_MANIFESTS: ProtocolManifest[] = [
  aaveV3,
  sky,
  uniswapV2,
  uniswapV3,
  ens,
];
