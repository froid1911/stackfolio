/**
 * Shared fallback for deliveries that arrive without resulting state.
 *
 * When the reactor's operation index lags, backfill replays operations
 * statelessly: the batch carries the operations but no state to read.
 * Skipping those leaves rows stale until the document's next write, so
 * the index reads the document's current state off the host module
 * instead. A read failure (a deleted or unreadable document) yields
 * `undefined`, and the caller keeps its rows as they are.
 *
 * A deleted document's operations stay in the reactor's history, so every
 * backfill replay asks for its state again. The first failure per document
 * is a warning; repeats drop to debug, where a persistent read failure
 * stays visible without flooding the log.
 */

export interface DocumentReader {
  get(id: string): Promise<{ state: unknown }>;
}

/** Documents whose state read already failed; one warning per process. */
const warned = new Set<string>();

export function stateFetcher(
  read: DocumentReader,
  logPrefix: string,
): (documentId: string) => Promise<string | undefined> {
  return async (documentId) => {
    try {
      const doc = await read.get(documentId);
      return JSON.stringify(doc.state);
    } catch (error) {
      const message = `[${logPrefix}] state fetch failed for ${documentId}: ${error instanceof Error ? error.message : String(error)}`;
      const key = `${logPrefix}:${documentId}`;
      if (warned.has(key)) console.debug(message);
      else {
        warned.add(key);
        console.warn(message);
      }
      return undefined; // deleted or unreadable
    }
  };
}
