import * as z from "zod";

import {
  Id,
  IsoDate,
  NonNegativeDecimalString,
  NonNegativeMoneySchema,
} from "./primitives";

/**
 * A tax lot: a specific tranche of a holding acquired at a point in time at a
 * known cost. Tracking lots lets the product report cost basis and unrealized
 * gain per acquisition without ever moving money.
 *
 * - `quantity` is the number of units in the lot (shares, coins, bottles, items).
 * - `unitCost` is the price paid per unit at acquisition.
 * - `acquiredOn` is the acquisition date.
 */
export const Lot = z
  .object({
    /** Stable id for this lot. */
    id: Id,
    /** Units acquired in this lot (non-negative). */
    quantity: NonNegativeDecimalString,
    /** Cost per unit at acquisition (non-negative). */
    unitCost: NonNegativeMoneySchema,
    /** Acquisition date (YYYY-MM-DD). */
    acquiredOn: IsoDate,
    /** Optional total fees/commissions paid for this lot (non-negative). */
    fees: NonNegativeMoneySchema.optional(),
    /** Optional free-text note (e.g. broker, provenance, certificate id). */
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((lot, ctx) => {
    if (lot.fees && lot.fees.currency !== lot.unitCost.currency) {
      ctx.addIssue({
        code: "custom",
        message: `fees currency (${lot.fees.currency}) must match unitCost currency (${lot.unitCost.currency})`,
        path: ["fees", "currency"],
      });
    }
  });
export type Lot = z.infer<typeof Lot>;
