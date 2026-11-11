import {
  DocumentStateViewer,
  DocumentToolbar,
} from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  PriceBookAction,
  PriceBookDocument,
} from "document-models/price-book";
import { actions } from "document-models/price-book";
import { useState } from "react";

export default function Editor({
  document,
  dispatch,
}: EditorProps<PriceBookDocument, PriceBookAction>) {
  // The reducer's message for the last action the document rejected
  const [error, setError] = useState<string>();

  const handleSetName = (name: string) => {
    setError(undefined);
    // 'actions' contains all available actions for this document type
    dispatch(actions.setName(name), (errors) => setError(errors[0]?.message));
  };

  return (
    <div className="mx-auto max-w-4xl bg-background p-6">
      <DocumentToolbar document={document} />

      {/* "ph-default-styles" sets default styles for basic UI elements */}
      <div className="ph-default-styles">
        {/* Edit document name */}
        <label className="my-6">
          <h3>Document Name</h3>
          <input
            type="text"
            defaultValue={document.header.name}
            placeholder="Enter document name..."
            title="Edit document name and click outside to save."
            autoFocus
            onBlur={(e) => handleSetName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="font-semibold"
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <hr />

        {/* Document header info */}
        <div className="mb-6 grid grid-cols-2 gap-x-8">
          <label>
            <h3 className="text-base">ID</h3>
            <input
              type="text"
              value={document.header.id}
              readOnly
              className="font-mono"
            />
          </label>
          <label>
            <h3 className="text-base">Created</h3>
            <input
              type="text"
              value={new Date(document.header.createdAtUtcIso).toLocaleString()}
              readOnly
            />
          </label>
          <label>
            <h3 className="text-base">Type</h3>
            <input type="text" value={document.header.documentType} readOnly />
          </label>
          <label>
            <h3 className="text-base">Last Modified</h3>
            <input
              type="text"
              value={new Date(
                document.header.lastModifiedAtUtcIso,
              ).toLocaleString()}
              readOnly
            />
          </label>
        </div>

        {/* Document state. For its history use useDocumentOperations(document.header.id, "global"), not document.operations */}
        <div className="mt-6">
          <h3 className="text-base">Document State</h3>
          <DocumentStateViewer state={document.state} />
        </div>
      </div>
    </div>
  );
}
