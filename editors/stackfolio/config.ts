import type { PHAppConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHAppConfig = {
  isDragAndDropEnabled: true,
  allowedDocumentTypes: [
    "stackfolio/portfolio",
    "stackfolio/wallet-account",
    "stackfolio/asset-registry",
    "stackfolio/price-book",
    "stackfolio/eth-staking",
  ],
};
