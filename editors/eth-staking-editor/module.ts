/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action, EditorModule, EditorProps, PHDocument, PHBaseState } from "document-model";
import type {
  EthStakingAction,
  EthStakingDocument,
} from "document-models/eth-staking";
import type { ComponentType } from "react";
import type { ComponentType as ReactComponentType } from "react";
import { createElement } from "react";



/** Document editor module for the "stackfolio/eth-staking" document type */
const suspend = <D extends PHDocument<PHBaseState>, A extends Action>(
  load: () => Promise<{ default: ComponentType<EditorProps<D, A>> }>,
  // HostedEditorProps (drive/document context) flow through to the inner
  // editor; the concrete editor ignores what it doesn't declare.
): EditorModule["Component"] => {
  // Codegen ships `Component: lazy(() => import("./editor.js"))`. This
  // Connect build (React 19) never renders the lazy component: the
  // container parks on its own "Loading editor" loader, so lazy's chunk
  // import never starts and the document view hangs forever. Resolve the
  // chunk eagerly at module load; the component renders once the
  // (already in-flight) import lands, suspending on the same promise.
  let ready: ComponentType<EditorProps<D, A>> | null = null;
  const settled = load().then(
    (m) => {
      ready = m.default;
    },
    () => {
      // The chunk failed; the next render re-imports (and the error surfaces).
    },
  );
  const pending: Promise<void> & {
    status?: string;
    value?: unknown;
    reason?: unknown;
  } = Object.assign(settled, { status: "pending" });
  // React's lazy protocol reads thenable.status to short-circuit suspense.
  void settled.then(
    () => {
      pending.status = "fulfilled";
      pending.value = undefined;
    },
    (e) => {
      pending.status = "rejected";
      pending.reason = e;
    },
  );
  const Inner = ((props: EditorProps<D, A>) => {
    (window as unknown as { __qaEd?: unknown[] }).__qaEd = ((window as unknown as { __qaEd?: unknown[] }).__qaEd ?? []);
    (window as unknown as { __qaEd: unknown[] }).__qaEd.push("render:" + (ready ? "ready" : "suspended"));
    if (typeof window !== "undefined") (window as unknown as { __qaMod?: unknown }).__qaMod = true;
    if (!ready) throw pending;
    const C: ComponentType<EditorProps<D, A>> = ready;
    // `EditorProps` is a union; the resolved component takes whichever
    // side the container passes. Cast at the element boundary.
    return createElement(C, props as never);
  }) as unknown as EditorModule["Component"];
  return Inner;
};

export const EthStakingEditor: EditorModule<
  EthStakingDocument,
  EthStakingAction
> = {
  Component: suspend(() => import("./editor.js")),
  documentTypes: ["stackfolio/eth-staking"],
  config: {
    id: "eth-staking-editor",
    name: "ETH Staking Editor",
  },
};
