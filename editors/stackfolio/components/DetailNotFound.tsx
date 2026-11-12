/**
 * The detail slug named nothing in the live data (stale or mistyped
 * link). An affordance, not an error page: the page underneath stays.
 */
export function DetailNotFound({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl rounded-t-2xl border border-border bg-background p-6 shadow-2xl">
      <p className="text-sm">
        Nothing here matches <code className="rounded bg-muted px-1">{label}</code> - the
        link is stale or mistyped.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        Close
      </button>
    </div>
  );
}
