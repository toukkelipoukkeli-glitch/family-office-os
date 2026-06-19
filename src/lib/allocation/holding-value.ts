import { Money } from "../money";
import type { Holding } from "../model/holding";
import type { Valuation } from "../model/valuation";

/**
 * Resolve a holding's *current* reported value from its valuation history.
 *
 * A holding carries a list of {@link Valuation}s in any order (see
 * `model/holding.ts`); the current value is the one with the most recent
 * `asOf`. Ties on `asOf` are broken by later array position so a freshly
 * appended valuation wins — this matches the "most recent last is a UI
 * convention" note in the model.
 *
 * READ-ONLY product: this reads what a holding is worth; it never changes it.
 */

/** Compare two ISO-8601 timestamps. Returns <0, 0, or >0. */
function compareAsOf(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (ta !== tb) return ta - tb;
  // Fall back to lexicographic compare if the timestamps parse equal (or NaN)
  // so the ordering is still total and deterministic.
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The most recent valuation for a holding, or `undefined` when the holding has
 * no valuations. When several share the latest `asOf`, the one appearing last
 * in the array wins.
 */
export function latestValuation(holding: Holding): Valuation | undefined {
  let best: Valuation | undefined;
  for (const v of holding.valuations) {
    if (best === undefined || compareAsOf(v.asOf, best.asOf) >= 0) {
      best = v;
    }
  }
  return best;
}

/**
 * The current value of a holding as a {@link Money}, taken from its latest
 * valuation. Holdings with no valuations have no determinable value and return
 * `undefined` (callers decide whether to treat that as zero or to surface it).
 *
 * The returned `Money` is in the holding's own valuation currency — convert to
 * a base currency with an {@link import("./fx").FxConverter} before rolling up.
 */
export function holdingValue(holding: Holding): Money | undefined {
  const v = latestValuation(holding);
  if (!v) return undefined;
  return Money.of(v.value.amount, v.value.currency);
}
