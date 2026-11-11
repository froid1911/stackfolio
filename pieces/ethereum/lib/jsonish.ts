/**
 * Accept a JSON-ish workflow property: either a JSON string (hand-typed into
 * the form) or the live value the workflow engine injects when a whole
 * `{{steps.x.output.y}}` reference is passed through. The engine hands over
 * raw JSON for whole-value references, so accepting only strings would break
 * every chained step.
 */
export function parseJsonish(value: unknown, prop: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${prop} must be valid JSON (or a step reference).`);
  }
}
