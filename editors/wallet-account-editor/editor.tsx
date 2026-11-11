import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  WalletAccountAction,
  WalletAccountDocument,
} from "document-models/wallet-account";
import { WalletLedger } from "./components/WalletLedger.js";

export default function Editor({
  document,
}: EditorProps<WalletAccountDocument, WalletAccountAction>) {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col bg-background">
      <DocumentToolbar document={document} />
      <WalletLedger />
    </div>
  );
}
