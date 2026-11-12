export { aaveV3 } from "./aave-v3.js";
export { sky } from "./sky.js";
export { uniswapV2 } from "./uniswap-v2.js";
export { uniswapV3 } from "./uniswap-v3.js";
export { ens } from "./ens.js";
export { curve } from "./curve.js";
export { balancerV1 } from "./balancer-v1.js";
export { sushiswapChef } from "./sushiswap.js";
export { convex } from "./convex.js";

import { aaveV3 } from "./aave-v3.js";
import { ens } from "./ens.js";
import { sky } from "./sky.js";
import { uniswapV2 } from "./uniswap-v2.js";
import { uniswapV3 } from "./uniswap-v3.js";
import { curve } from "./curve.js";
import { balancerV1 } from "./balancer-v1.js";
import { sushiswapChef } from "./sushiswap.js";
import { convex } from "./convex.js";
import type { ProtocolManifest } from "../manifest.js";

/** The launch set, in the order the registry document should seed them. */
export const SEED_MANIFESTS: ProtocolManifest[] = [
  aaveV3,
  sky,
  uniswapV2,
  uniswapV3,
  ens,
  curve,
  balancerV1,
  sushiswapChef,
  convex,
];
