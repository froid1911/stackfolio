/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  portfolioAddressBookActions,
  portfolioIdentityActions,
  portfolioPricingActions,
  portfolioReconcilerActions,
  portfolioSnapshotsActions,
} from "./gen/creators.js";

/** Actions for the Portfolio document model */

export const actions = {
  ...baseActions,
  ...portfolioIdentityActions,
  ...portfolioAddressBookActions,
  ...portfolioPricingActions,
  ...portfolioSnapshotsActions,
  ...portfolioReconcilerActions,
};
