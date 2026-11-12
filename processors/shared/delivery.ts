/**
 * Shared fallback for deliveries that arrive without resulting state.
 *
 * When the reactor's operation index lags, backfill replays operations
 * statelessly: the batch carries the operations but no state to read.
 * Skipping those leaves rows stale until the document's next write, so
 * the index reads the document's current state off the host module
 * instead. A read failure (a deleted or unreadable document) yields
 * `undefined`, and the caller keeps its rows as they are.
 */

export interface DocumentReader {
  get(id: string): Promise<{ state: unknown }>;
}

export function stateFetcher(
  read: DocumentReader,
  logPrefix: string,
): (documentId: string) => Promise<string | undefined> {
  return async (documentId) => {
    try {
      const doc = await read.get(documentId);
      return JSON.stringify(doc.state);
    } catch (error) {
      console.warn(
        `[${logPrefix}] state fetch failed for ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined; // deleted or unreadable
    }
  };
}
