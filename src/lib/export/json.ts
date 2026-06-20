/**
 * Deterministic JSON serialization.
 *
 * {@link toJson} produces a byte-stable, pretty-printed JSON string by sorting
 * every object's keys recursively. Two structurally-equal values always produce
 * identical bytes regardless of the insertion order of their keys, which makes
 * the output snapshot-testable and safe to archive or diff. Pure and offline:
 * no DOM, clock, or network, and it only serializes — nothing moves money.
 *
 * Non-finite numbers (`NaN`, `±Infinity`) throw rather than serializing to the
 * JSON literal `null`, which would silently corrupt a numeric field.
 */

/** Options for {@link toJson}. */
export interface JsonOptions {
  /** Indentation width in spaces. Default `2`. */
  readonly indent?: number;
  /**
   * Sort object keys lexicographically for a canonical, order-independent
   * serialization. Default `true`. Set `false` to preserve insertion order.
   */
  readonly sortKeys?: boolean;
}

/** Recursively rebuild a value with object keys sorted (stable canonical form). */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number to JSON: ${value}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  // Honour a custom `toJSON` (e.g. Money) before sorting keys, so domain value
  // objects serialize through their own canonical representation.
  const obj = value as { toJSON?: () => unknown };
  if (typeof obj.toJSON === "function") {
    return canonicalize(obj.toJSON());
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

/**
 * Serialize a value to a deterministic, pretty-printed JSON string.
 *
 * With `sortKeys` (the default) the output is canonical: structurally-equal
 * inputs yield identical bytes. A trailing newline is appended for clean,
 * diff-friendly files.
 */
export function toJson(value: unknown, options: JsonOptions = {}): string {
  const { indent = 2, sortKeys = true } = options;
  const prepared = sortKeys ? canonicalize(value) : value;
  return `${JSON.stringify(prepared, jsonReplacer, indent)}\n`;
}

/** Reject non-finite numbers even when `sortKeys` is off (canonicalize skipped). */
function jsonReplacer(_key: string, val: unknown): unknown {
  if (typeof val === "number" && !Number.isFinite(val)) {
    throw new Error(`Cannot serialize non-finite number to JSON: ${val}`);
  }
  return val;
}
