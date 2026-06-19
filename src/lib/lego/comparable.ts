import * as z from "zod";

import {
  Id,
  IsoDate,
  NonNegativeDecimalString,
} from "../model/primitives";
import { Completeness, SetCondition } from "./condition";

/**
 * The venue a comparable secondary-market sale came from. Affects the trust we
 * place in a price: a completed auction with bidding is a stronger signal than
 * a single asking price or a private deal.
 */
export const COMP_SOURCES = [
  "auction", // completed competitive auction (e.g. eBay sold)
  "marketplace", // fixed-price marketplace sale (BrickLink/StockX-style)
  "dealer", // dealer/retail secondary sale
  "private", // private/peer sale, self-reported
] as const;

export const CompSource = z.enum(COMP_SOURCES);
export type CompSource = z.infer<typeof CompSource>;

/**
 * A single comparable secondary-market sale of a LEGO set.
 *
 * Comps are the raw evidence the price guide aggregates. Each records the
 * realized price, the condition and completeness of the example sold, when it
 * sold, and where. The price guide normalizes each comp to a factory-sealed,
 * fully-complete equivalent before aggregating, so heterogeneous comps can be
 * pooled.
 *
 * READ-ONLY product: a comp is observed evidence; recording one never lists or
 * sells anything.
 */
export const Comparable = z
  .object({
    /** Stable id for this comparable record. */
    id: Id,
    /** Realized sale price (must match the set's currency at aggregation). */
    price: NonNegativeDecimalString,
    /** Currency of {@link price}. */
    currency: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, "currency must be a 3-letter code")),
    /** Condition of the example that sold. */
    condition: SetCondition,
    /**
     * Completeness fraction of the example in [0, 1]. Defaults to 1 (fully
     * complete); sealed examples are always complete.
     */
    completeness: Completeness.default("1"),
    /** Date the sale completed. */
    soldOn: IsoDate,
    /** Where the sale happened. */
    source: CompSource,
    /** Optional free-text note (listing id, grader, etc.). */
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type Comparable = z.infer<typeof Comparable>;
