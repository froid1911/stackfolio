/** One operation as the reactor's execute() expects it: a global-scope OSC
 * action. Ids and timestamps come from the environment, never from a caller. */
export function toGlobalAction(type: string, input: unknown) {
  return {
    id: crypto.randomUUID(),
    timestampUtcMs: new Date().toISOString(),
    type,
    input,
    scope: "global",
  };
}

/**
 * The `global` half of a reactor document's state. The piece deliberately
 * does not import generated model types, so the state arrives as an opaque
 * object; `in`-narrowing checks the envelope and `T` describes the fields
 * the calling action names in its dispatch - the target reducer enforces
 * the rest at execution time.
 */
export function globalState<T>(doc: { state: unknown }): Partial<T> {
  const state: unknown = doc.state;
  if (state && typeof state === "object" && "global" in state) {
    const global: unknown = state.global;
    return (global && typeof global === "object" ? global : {});
  }
  return {};
}
