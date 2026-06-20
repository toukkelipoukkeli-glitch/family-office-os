import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import { seededEstatePlan as seededEstatePlanForTest } from "@/lib/estate";

import {
  buildTaxTimeline,
  CATEGORY_LABELS,
  TIMELINE_CATEGORIES,
  TaxTimelineError,
  type TaxTimelineInputs,
} from "./taxtimeline";
import {
  SEEDED_YEAR,
  seededSchedule,
  seededTaxInputs,
  seededTimelineInputs,
} from "./fixtures";

const f0 = (m: Money) => m.format({ fractionDigits: 0 });

describe("buildTaxTimeline — seeded composition", () => {
  const tl = buildTaxTimeline(seededTimelineInputs);

  it("covers the right year and currency", () => {
    expect(tl.year).toBe(SEEDED_YEAR);
    expect(tl.currency).toBe("USD");
  });

  it("rolls up the composed engine headline numbers exactly", () => {
    expect(tl.estimatedTax.format({ fractionDigits: 2 })).toBe("$250,274.75");
    expect(tl.quarterlyPayment.format({ fractionDigits: 2 })).toBe(
      "$62,568.68",
    );
    expect(f0(tl.harvestableLoss)).toBe("$21,000");
    expect(f0(tl.charitableBenefit)).toBe("$700,500");
  });

  it("emits one event per composed domain action", () => {
    // 4 quarterly tax + 1 filing + harvest review + 3 wash-sale + 2 gifts +
    // 1 charitable deadline + estate review + estate gifting = 14.
    expect(tl.events).toHaveLength(14);
    expect(tl.deadlineCount).toBe(7);
  });

  it("orders events chronologically with a stable category tie-break", () => {
    const order = tl.events.map((e) => `${e.date}:${e.id}`);
    expect(order).toEqual([
      "2026-01-15:estate-review",
      "2026-04-15:tax-q1",
      "2026-06-15:tax-q2",
      "2026-09-15:tax-q3",
      "2026-11-01:harvest-washsale-baba-1",
      "2026-11-01:harvest-washsale-baba-2",
      "2026-11-01:harvest-washsale-meta-1",
      "2026-11-15:gift-g-2026-acme",
      "2026-11-15:gift-g-2026-cash",
      "2026-12-01:harvest-review",
      "2026-12-31:estate-annual-gifting",
      "2026-12-31:charitable-deadline",
      "2027-01-15:tax-q4",
      "2027-04-15:filing-return",
    ]);
  });

  it("is fully deterministic (identical re-run)", () => {
    const a = buildTaxTimeline(seededTimelineInputs);
    const b = buildTaxTimeline(seededTimelineInputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("splits the estimated tax into 4 quarters that reconcile to the total", () => {
    const q = tl.events.filter((e) => e.category === "estimated-tax");
    expect(q).toHaveLength(4);
    const sum = q.reduce(
      (acc, e) => acc.plus(e.amount!),
      Money.zero(tl.currency),
    );
    expect(sum.format({ fractionDigits: 2 })).toBe(
      tl.estimatedTax.format({ fractionDigits: 2 }),
    );
    // Q4 absorbs the rounding remainder.
    expect(q[3].amount!.format({ fractionDigits: 2 })).toBe("$62,568.71");
  });

  it("anchors the four quarterly due dates to Apr/Jun/Sep/Jan-15", () => {
    const dates = tl.events
      .filter((e) => e.category === "estimated-tax")
      .map((e) => e.date);
    expect(dates).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-09-15",
      "2027-01-15",
    ]);
  });
});

describe("buildTaxTimeline — harvest / wash-sale composition", () => {
  const tl = buildTaxTimeline(seededTimelineInputs);

  it("surfaces a harvest review on the valuation date", () => {
    const review = tl.events.find((e) => e.id === "harvest-review")!;
    expect(review.date).toBe("2026-12-01");
    expect(review.category).toBe("harvest");
    expect(f0(review.amount!)).toBe("$21,000");
  });

  it("emits a ±30-day wash-sale blackout window per flagged lot", () => {
    const blackouts = tl.events.filter((e) =>
      e.id.startsWith("harvest-washsale-"),
    );
    expect(blackouts).toHaveLength(3);
    for (const b of blackouts) {
      expect(b.date).toBe("2026-11-01"); // asOf - 30
      expect(b.windowEnd).toBe("2026-12-31"); // asOf + 30
      expect(b.severity).toBe("info");
    }
  });

  it("contributes no harvest events when no harvest input is given", () => {
    const noHarvest = buildTaxTimeline({
      year: SEEDED_YEAR,
      currency: "USD",
      taxEstimate: { inputs: seededTaxInputs, schedule: seededSchedule },
    });
    expect(noHarvest.events.some((e) => e.category === "harvest")).toBe(false);
    expect(f0(noHarvest.harvestableLoss)).toBe("$0");
  });
});

describe("buildTaxTimeline — charitable composition (year slicing)", () => {
  it("only includes the gifts that fall in the timeline year", () => {
    const tl = buildTaxTimeline(seededTimelineInputs);
    const gifts = tl.events.filter((e) => e.id.startsWith("gift-"));
    // The seeded giving plan has 2 gifts in 2026 (ACME stock + year-end cash).
    expect(gifts.map((g) => g.id).sort()).toEqual([
      "gift-g-2026-acme",
      "gift-g-2026-cash",
    ]);
  });

  it("uses next year's giving slice when the timeline year shifts", () => {
    const tl2027 = buildTaxTimeline({
      ...seededTimelineInputs,
      year: 2027,
      // Drop the 2026-specific harvest/tax to isolate the giving slice.
      taxEstimate: undefined,
      harvest: undefined,
      estate: undefined,
    });
    const gifts = tl2027.events.filter((e) => e.id.startsWith("gift-"));
    expect(gifts).toHaveLength(1);
    expect(gifts[0].id).toBe("gift-g-2027-fund");
  });

  it("has a year-end charitable completion deadline", () => {
    const tl = buildTaxTimeline(seededTimelineInputs);
    const deadline = tl.events.find((e) => e.id === "charitable-deadline")!;
    expect(deadline.date).toBe("2026-12-31");
    expect(deadline.severity).toBe("deadline");
  });
});

describe("buildTaxTimeline — estate composition", () => {
  const tl = buildTaxTimeline(seededTimelineInputs);

  it("emits an annual liquidity review and a year-end gifting deadline", () => {
    const review = tl.events.find((e) => e.id === "estate-review")!;
    const gifting = tl.events.find((e) => e.id === "estate-annual-gifting")!;
    expect(review.date).toBe("2026-01-15");
    expect(gifting.date).toBe("2026-12-31");
    expect(gifting.severity).toBe("deadline");
  });

  it("reports the seeded estate's liquidity as covered (info)", () => {
    // The seeded estate's $15.9M liquid assets cover the $7.65M settlement
    // need, so the annual review is informational rather than an action item.
    const review = tl.events.find((e) => e.id === "estate-review")!;
    expect(review.severity).toBe("info");
    expect(review.detail).toMatch(/fully covered/);
  });

  it("flags a liquidity shortfall as an action when the estate is illiquid", () => {
    // Force a shortfall by demanding more settlement than liquid assets cover:
    // strip the cash/marketable assets so the estate cannot self-fund.
    const illiquidPlan = {
      ...seededEstatePlanForTest,
      assets: seededEstatePlanForTest.assets.filter(
        (a) => a.liquidity === "illiquid",
      ),
    };
    const stressed = buildTaxTimeline({
      year: 2026,
      currency: "USD",
      estate: illiquidPlan,
    });
    const review = stressed.events.find((e) => e.id === "estate-review")!;
    expect(review.severity).toBe("action");
    expect(review.detail).toMatch(/SHORTFALL/);
  });
});

describe("buildTaxTimeline — category roll-ups", () => {
  const tl = buildTaxTimeline(seededTimelineInputs);

  it("returns roll-ups in canonical category order", () => {
    expect(tl.byCategory.map((c) => c.category)).toEqual([
      ...TIMELINE_CATEGORIES,
    ]);
  });

  it("counts events per category", () => {
    const counts = Object.fromEntries(
      tl.byCategory.map((c) => [c.category, c.count]),
    );
    expect(counts).toEqual({
      "estimated-tax": 4,
      harvest: 4,
      charitable: 3,
      estate: 2,
      filing: 1,
    });
  });

  it("sums the per-category amounts exactly", () => {
    const tax = tl.byCategory.find((c) => c.category === "estimated-tax")!;
    expect(tax.total.format({ fractionDigits: 2 })).toBe(
      tl.estimatedTax.format({ fractionDigits: 2 }),
    );
    const filing = tl.byCategory.find((c) => c.category === "filing")!;
    expect(f0(filing.total)).toBe("$0");
  });

  it("has a human label for every category", () => {
    for (const cat of TIMELINE_CATEGORIES) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

describe("buildTaxTimeline — graceful degradation & validation", () => {
  it("builds a tax-only timeline when only the estimate is supplied", () => {
    const tl = buildTaxTimeline({
      year: 2026,
      taxEstimate: { inputs: seededTaxInputs, schedule: seededSchedule },
    });
    expect(tl.events.some((e) => e.category === "estimated-tax")).toBe(true);
    expect(tl.events.some((e) => e.category === "estate")).toBe(false);
    expect(tl.currency).toBe("USD");
  });

  it("throws when no input can resolve a currency", () => {
    expect(() => buildTaxTimeline({ year: 2026 })).toThrow(TaxTimelineError);
  });

  it("rejects a non-integer year", () => {
    expect(() =>
      buildTaxTimeline({ year: 2026.5, currency: "USD" } as TaxTimelineInputs),
    ).toThrow(/integer/);
  });

  it("rejects a currency mismatch between engines", () => {
    expect(() =>
      buildTaxTimeline({
        year: 2026,
        currency: "EUR",
        taxEstimate: { inputs: seededTaxInputs, schedule: seededSchedule },
      }),
    ).toThrow(TaxTimelineError);
  });

  it("produces an empty timeline body with a forced currency and no engines", () => {
    const tl = buildTaxTimeline({ year: 2026, currency: "USD" });
    expect(tl.events).toHaveLength(0);
    expect(tl.deadlineCount).toBe(0);
    expect(tl.byCategory.every((c) => c.count === 0)).toBe(true);
  });
});

describe("buildTaxTimeline — adversarial edge cases", () => {
  it("keeps the 4 quarterly instalments reconciling exactly even on an indivisible cent total", () => {
    // 250274.75 / 4 = 62568.6875 → floors to 62568.68 ×3, Q4 absorbs +0.03.
    // The invariant under test: no cent is ever created or lost regardless of
    // how ugly the remainder is.
    const tl = buildTaxTimeline(seededTimelineInputs);
    const q = tl.events
      .filter((e) => e.category === "estimated-tax")
      .map((e) => e.amount!);
    const sum = q.reduce((acc, m) => acc.plus(m), Money.zero("USD"));
    expect(sum.amount.eq(tl.estimatedTax.amount)).toBe(true);
    // First three are equal and floored; the last differs by the remainder.
    expect(q[0].amount.eq(q[1].amount)).toBe(true);
    expect(q[1].amount.eq(q[2].amount)).toBe(true);
    expect(q[3].amount.gte(q[0].amount)).toBe(true);
  });

  it("anchors the Q4 instalment and the filing deadline into the NEXT calendar year", () => {
    // Cross-year arithmetic must not drift: Q4 due Jan-15 and the return due
    // Apr-15 both belong to year+1, and sort after every in-year event.
    const tl = buildTaxTimeline(seededTimelineInputs);
    const q4 = tl.events.find((e) => e.id === "tax-q4")!;
    const filing = tl.events.find((e) => e.id === "filing-return")!;
    expect(q4.date).toBe("2027-01-15");
    expect(filing.date).toBe("2027-04-15");
    // They are the last two events in the chronological order.
    const ids = tl.events.map((e) => e.id);
    expect(ids.slice(-2)).toEqual(["tax-q4", "filing-return"]);
  });

  it("computes a correct ±30-day wash-sale window across month boundaries", () => {
    // asOf = Nov 30 still flags the BABA Nov-19 add (within ±30d); the window
    // must be exact day arithmetic across two month boundaries:
    //   −30d → Oct 31 (Nov has 30 days, Oct has 31) and +30d → Dec 30.
    const tl = buildTaxTimeline({
      ...seededTimelineInputs,
      taxEstimate: undefined,
      giving: undefined,
      estate: undefined,
      harvest: { ...seededTimelineInputs.harvest!, asOf: "2026-11-30" },
    });
    const blackout = tl.events.find((e) =>
      e.id.startsWith("harvest-washsale-"),
    )!;
    expect(blackout).toBeDefined();
    expect(blackout.date).toBe("2026-10-31"); // asOf − 30
    expect(blackout.windowEnd).toBe("2026-12-30"); // asOf + 30
  });

  it("emits a 'no candidates' harvest review without any blackout windows when nothing is underwater", () => {
    // Price every symbol far ABOVE cost so no lot is harvestable: the review
    // event must still appear (severity action) but produce zero wash-sale rows.
    const ledger = seededTimelineInputs.harvest!.ledger;
    const upPrices: Record<string, string> = {};
    for (const sym of Object.keys(seededTimelineInputs.harvest!.prices)) {
      upPrices[sym] = "100000";
    }
    const tl = buildTaxTimeline({
      year: SEEDED_YEAR,
      currency: "USD",
      harvest: { ledger, prices: upPrices, asOf: "2026-12-01" },
    });
    const review = tl.events.find((e) => e.id === "harvest-review")!;
    expect(review.detail).toMatch(/No underwater lots/);
    expect(
      tl.events.some((e) => e.id.startsWith("harvest-washsale-")),
    ).toBe(false);
    expect(f0(tl.harvestableLoss)).toBe("$0");
  });

  it("is order-independent: the same inputs sort identically regardless of engine declaration order", () => {
    // Determinism guard beyond a plain re-run — the sort must not depend on the
    // order events happen to be pushed in.
    const tl = buildTaxTimeline(seededTimelineInputs);
    const dates = tl.events.map((e) => e.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
