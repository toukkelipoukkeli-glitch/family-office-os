import * as z from "zod";

import { Holding } from "./holding";
import { CurrencyCode, Id, IsoDateTime } from "./primitives";

/**
 * A portfolio: the top-level container for a family's holdings, reported in a
 * single base currency. Holdings may be denominated in other currencies;
 * `baseCurrency` is the currency the portfolio rolls up to for reporting.
 *
 * READ-ONLY product: a portfolio is a view of what the family owns; nothing in
 * this model moves money or places trades.
 */
export const Portfolio = z
  .object({
    /** Stable id for this portfolio. */
    id: Id,
    /** Human-readable name (e.g. "Ursin Family Office"). */
    name: z.string().trim().min(1, "portfolio name must not be empty"),
    /** Base reporting currency the portfolio rolls up to. */
    baseCurrency: CurrencyCode,
    /** The holdings in this portfolio. */
    holdings: z.array(Holding).default([]),
    /** When the portfolio record was created. */
    createdAt: IsoDateTime.optional(),
    /** When the portfolio record was last updated. */
    updatedAt: IsoDateTime.optional(),
  })
  .strict()
  .superRefine((portfolio, ctx) => {
    // Holding ids must be unique within a portfolio.
    const seen = new Set<string>();
    portfolio.holdings.forEach((h, i) => {
      if (seen.has(h.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate holding id: ${h.id}`,
          path: ["holdings", i, "id"],
        });
      }
      seen.add(h.id);
    });
  });
export type Portfolio = z.infer<typeof Portfolio>;
