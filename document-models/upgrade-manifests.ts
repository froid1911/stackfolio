/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import { assetRegistryUpgradeManifest } from "document-models/asset-registry/upgrades";
import { ethStakingUpgradeManifest } from "document-models/eth-staking/upgrades";
import { portfolioUpgradeManifest } from "document-models/portfolio/upgrades";
import { walletAccountUpgradeManifest } from "document-models/wallet-account/upgrades";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  assetRegistryUpgradeManifest,
  ethStakingUpgradeManifest,
  portfolioUpgradeManifest,
  walletAccountUpgradeManifest,
];
