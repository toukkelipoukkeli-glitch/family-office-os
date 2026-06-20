import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  attribute,
  AttributionError,
  multiPeriodAttribution,
  FAMILY_OFFICE_ATTRIBUTION,
  FAMILY_OFFICE_MULTI_PERIOD,
  type AttributionInput,
} from "./index";

/** Assert a Decimal is within `eps` of `expected` (default 1e-9). */
function expectClose(actual: Decimal, expected: number, eps = 1e-9): void {
  const diff = actual.minus(expected).abs().toNumber();
  expect(
    diff,
    `expected ${actual.toFixed(12)} ≈ ${expected} (|Δ|=${diff})`,
  ).toBeLessThan(eps);
}

describe("attribute — known answers (textbook two-segment book)", () => {
  // A classic Brinson worked example: equities over-weighted and out-performing,
  // bonds under-weighted. Hand-computed below.
  const twoSegment: AttributionInput = {
    method: "BF",
    segments: [
      {
        id: "equity",
        label: "Equity",
        portfolioWeight: 0.7,
        benchmarkWeight: 0.6,
        portfolioReturn: 0.1,
        benchmarkReturn: 0.08,
      },
      {
        id: "bonds",
        label: "Bonds",
        portfolioWeight: 0.3,
        benchmarkWeight: 0.4,
        portfolioReturn: 0.03,
        benchmarkReturn: 0.04,
      },
    ],
  };

  it("computes the total portfolio, benchmark and active returns", () => {
    const r = attribute(twoSegment);
    // R_p = .7·.10 + .3·.03 = .079 ; R_b = .6·.08 + .4·.04 = .064
    expectClose(r.portfolioReturn, 0.079);
    expectClose(r.benchmarkReturn, 0.064);
    expectClose(r.activeReturn, 0.015);
  });

  it("computes Brinson-Fachler segment effects by hand", () => {
    const r = attribute(twoSegment);
    const eq = r.segments.find((s) => s.id === "equity")!;
    const bd = r.segments.find((s) => s.id === "bonds")!;
    const B = 0.064; // total benchmark return

    // Allocation_BF = (w−W)·(b−B)
    expectClose(eq.allocation, (0.7 - 0.6) * (0.08 - B)); // .1·.016 = .0016
    expectClose(bd.allocation, (0.3 - 0.4) * (0.04 - B)); // -.1·-.024 = .0024
    // Selection = W·(r−b)
    expectClose(eq.selection, 0.6 * (0.1 - 0.08)); // .012
    expectClose(bd.selection, 0.4 * (0.03 - 0.04)); // -.004
    // Interaction = (w−W)·(r−b)
    expectClose(eq.interaction, (0.7 - 0.6) * (0.1 - 0.08)); // .002
    expectClose(bd.interaction, (0.3 - 0.4) * (0.03 - 0.04)); // .001
  });

  it("reconciles: allocation + selection + interaction == active return", () => {
    const r = attribute(twoSegment);
    expectClose(
      r.totalAllocation.plus(r.totalSelection).plus(r.totalInteraction),
      r.activeReturn.toNumber(),
    );
    expectClose(r.totalEffect, r.activeReturn.toNumber());
  });
});

describe("attribute — BHB vs BF", () => {
  it("BHB and BF give identical totals when benchmark weights sum to one", () => {
    // The BF correction term subtracts B·Σ(w−W); when both weight sets sum to 1
    // that is B·0 = 0, so totals coincide (only per-segment allocation splits
    // differ).
    const bf = attribute({ ...FAMILY_OFFICE_ATTRIBUTION, method: "BF" });
    const bhb = attribute({ ...FAMILY_OFFICE_ATTRIBUTION, method: "BHB" });
    expectClose(bf.totalAllocation, bhb.totalAllocation.toNumber());
    expectClose(bf.activeReturn, bhb.activeReturn.toNumber());
    expectClose(bf.totalEffect, bhb.totalEffect.toNumber());
  });

  it("BHB allocation of a market-neutral segment is non-zero; BF is zero", () => {
    // A segment held exactly at benchmark weight has zero allocation either way,
    // but a segment whose benchmark return equals the total benchmark return is
    // the discriminating case. Use a constructed two-segment book where one
    // segment's benchmark return equals B.
    const input: AttributionInput = {
      segments: [
        {
          id: "a",
          label: "A",
          portfolioWeight: 0.6,
          benchmarkWeight: 0.5,
          portfolioReturn: 0.05,
          benchmarkReturn: 0.05,
        },
        {
          id: "b",
          label: "B",
          portfolioWeight: 0.4,
          benchmarkWeight: 0.5,
          portfolioReturn: 0.05,
          benchmarkReturn: 0.05,
        },
      ],
    };
    // B = .5·.05 + .5·.05 = .05, equal to each segment's benchmark return.
    const bf = attribute({ ...input, method: "BF" });
    const bhb = attribute({ ...input, method: "BHB" });
    // BF: (b−B) = 0 for every segment → zero allocation.
    expectClose(bf.totalAllocation, 0);
    // BHB: (w−W)·b is non-zero per segment, but they net to zero overall here.
    const bhbA = bhb.segments.find((s) => s.id === "a")!;
    expectClose(bhbA.allocation, (0.6 - 0.5) * 0.05); // .005, not zero
  });
});

describe("attribute — family office fixture (known answers)", () => {
  it("matches hand/oracle-verified totals", () => {
    const r = attribute(FAMILY_OFFICE_ATTRIBUTION);
    expectClose(r.portfolioReturn, 0.0471);
    expectClose(r.benchmarkReturn, 0.03885);
    expectClose(r.activeReturn, 0.00825);
    expectClose(r.totalAllocation, 0.0045);
    expectClose(r.totalSelection, 0.00225);
    expectClose(r.totalInteraction, 0.0015);
    expectClose(r.totalEffect, 0.00825);
  });

  it("reconciles to the active return exactly", () => {
    const r = attribute(FAMILY_OFFICE_ATTRIBUTION);
    expect(r.totalEffect.minus(r.activeReturn).abs().toNumber()).toBeLessThan(
      1e-15,
    );
  });

  it("reports per-segment effects with the expected signs", () => {
    const r = attribute(FAMILY_OFFICE_ATTRIBUTION);
    const eq = r.segments.find((s) => s.id === "public-equity")!;
    // Overweight (0.40 vs 0.35) a beating-the-benchmark sleeve and picking
    // winners inside it → positive allocation & selection.
    expect(eq.allocation.isPositive()).toBe(true);
    expect(eq.selection.isPositive()).toBe(true);

    const ra = r.segments.find((s) => s.id === "real-assets")!;
    // At-weight sleeve that under-performed → zero allocation, negative selection.
    expectClose(ra.allocation, 0);
    expect(ra.selection.isNegative()).toBe(true);

    const cash = r.segments.find((s) => s.id === "cash")!;
    // At-weight, matched return → all effects zero.
    expectClose(cash.allocation, 0);
    expectClose(cash.selection, 0);
    expectClose(cash.interaction, 0);
  });
});

describe("attribute — validation", () => {
  it("rejects an empty segment list", () => {
    expect(() => attribute({ segments: [] })).toThrow(AttributionError);
  });

  it("rejects duplicate segment ids", () => {
    expect(() =>
      attribute({
        segments: [
          { id: "x", label: "X", portfolioWeight: 0.5, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
          { id: "x", label: "X2", portfolioWeight: 0.5, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
        ],
      }),
    ).toThrow(/duplicate/);
  });

  it("rejects portfolio weights that do not sum to one", () => {
    expect(() =>
      attribute({
        segments: [
          { id: "a", label: "A", portfolioWeight: 0.5, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
          { id: "b", label: "B", portfolioWeight: 0.3, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
        ],
      }),
    ).toThrow(/portfolio weights must sum to 1/);
  });

  it("rejects benchmark weights that do not sum to one", () => {
    expect(() =>
      attribute({
        segments: [
          { id: "a", label: "A", portfolioWeight: 0.5, benchmarkWeight: 0.4, portfolioReturn: 0, benchmarkReturn: 0 },
          { id: "b", label: "B", portfolioWeight: 0.5, benchmarkWeight: 0.4, portfolioReturn: 0, benchmarkReturn: 0 },
        ],
      }),
    ).toThrow(/benchmark weights must sum to 1/);
  });

  it("rejects negative weights and non-finite inputs", () => {
    expect(() =>
      attribute({
        segments: [
          { id: "a", label: "A", portfolioWeight: 1.2, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
          { id: "b", label: "B", portfolioWeight: -0.2, benchmarkWeight: 0.5, portfolioReturn: 0, benchmarkReturn: 0 },
        ],
      }),
    ).toThrow(/non-negative/);

    expect(() =>
      attribute({
        segments: [
          { id: "a", label: "A", portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: Infinity, benchmarkReturn: 0 },
        ],
      }),
    ).toThrow(/finite/);
  });
});

describe("multiPeriodAttribution — Carino linking", () => {
  it("compounds returns geometrically across periods", () => {
    const m = multiPeriodAttribution(FAMILY_OFFICE_MULTI_PERIOD);
    // Spot-check the compounded portfolio return against direct compounding.
    let gp = new Decimal(1);
    let gb = new Decimal(1);
    for (const p of FAMILY_OFFICE_MULTI_PERIOD.periods) {
      const r = attribute({ ...p, method: "BF" });
      gp = gp.times(r.portfolioReturn.plus(1));
      gb = gb.times(r.benchmarkReturn.plus(1));
    }
    expectClose(m.portfolioReturn, gp.minus(1).toNumber());
    expectClose(m.benchmarkReturn, gb.minus(1).toNumber());
    expectClose(m.activeReturn, gp.minus(gb).toNumber());
  });

  it("linked effects sum EXACTLY to the compounded active return", () => {
    const m = multiPeriodAttribution(FAMILY_OFFICE_MULTI_PERIOD);
    // This is the whole point of Carino smoothing.
    expect(m.totalEffect.minus(m.activeReturn).abs().toNumber()).toBeLessThan(
      1e-12,
    );
  });

  it("matches the single-period result when there is only one period", () => {
    const single = attribute(FAMILY_OFFICE_ATTRIBUTION);
    const linked = multiPeriodAttribution({
      method: "BF",
      periods: [FAMILY_OFFICE_ATTRIBUTION],
    });
    // For one period the Carino coefficient ratio is 1, so effects are identical.
    expectClose(linked.totalAllocation, single.totalAllocation.toNumber());
    expectClose(linked.totalSelection, single.totalSelection.toNumber());
    expectClose(linked.totalInteraction, single.totalInteraction.toNumber());
    expectClose(linked.activeReturn, single.activeReturn.toNumber());
  });

  it("naive summation of effects does NOT reconcile (motivating the scaling)", () => {
    // Sum the raw per-period effects without Carino scaling.
    let naive = new Decimal(0);
    for (const p of FAMILY_OFFICE_MULTI_PERIOD.periods) {
      naive = naive.plus(attribute({ ...p, method: "BF" }).totalEffect);
    }
    const m = multiPeriodAttribution(FAMILY_OFFICE_MULTI_PERIOD);
    // The naive sum equals the *arithmetic* sum of active returns, which differs
    // from the *geometric* compounded active return by a cross-compounding term.
    expect(naive.minus(m.activeReturn).abs().toNumber()).toBeGreaterThan(1e-6);
  });

  it("rejects an empty period list and mismatched segment universes", () => {
    expect(() => multiPeriodAttribution({ periods: [] })).toThrow(
      AttributionError,
    );
    expect(() =>
      multiPeriodAttribution({
        periods: [
          {
            segments: [
              { id: "a", label: "A", portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: 0.01, benchmarkReturn: 0.01 },
            ],
          },
          {
            segments: [
              { id: "b", label: "B", portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: 0.01, benchmarkReturn: 0.01 },
            ],
          },
        ],
      }),
    ).toThrow(/same segment ids/);
  });

  it("rejects period returns at or below -100%", () => {
    expect(() =>
      multiPeriodAttribution({
        periods: [
          {
            segments: [
              { id: "a", label: "A", portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: -1, benchmarkReturn: 0 },
            ],
          },
        ],
      }),
    ).toThrow(/-100%/);
  });
});

describe("attribute — adversarial reconciliation (both conventions)", () => {
  // A deterministic pseudo-random many-segment book. The Brinson identity
  // Σ(A+S+I) = R_p − R_b must hold to machine precision for BOTH conventions and
  // for arbitrary weights/returns (not just the curated textbook fixtures).
  function makeBook(seed: number, n: number): AttributionInput {
    // Simple deterministic LCG so the test is reproducible and offline.
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const rawPw = Array.from({ length: n }, () => rand() + 0.01);
    const rawBw = Array.from({ length: n }, () => rand() + 0.01);
    const sumPw = rawPw.reduce((a, b) => a + b, 0);
    const sumBw = rawBw.reduce((a, b) => a + b, 0);
    const segments = Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      label: `S${i}`,
      portfolioWeight: rawPw[i] / sumPw,
      benchmarkWeight: rawBw[i] / sumBw,
      portfolioReturn: rand() * 0.4 - 0.2, // −20%..+20%
      benchmarkReturn: rand() * 0.4 - 0.2,
    }));
    return { segments };
  }

  for (const method of ["BF", "BHB"] as const) {
    it(`${method}: effects reconcile to active return across many random books`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const book = makeBook(seed, 7);
        const r = attribute({ ...book, method });
        // The identity must hold near machine precision regardless of inputs.
        expect(
          r.totalEffect.minus(r.activeReturn).abs().toNumber(),
          `seed ${seed}`,
        ).toBeLessThan(1e-12);
        // Per-segment totals must also sum the three effects exactly.
        for (const seg of r.segments) {
          expect(
            seg.total
              .minus(seg.allocation.plus(seg.selection).plus(seg.interaction))
              .abs()
              .toNumber(),
          ).toBe(0);
        }
      }
    });
  }

  it("BHB and BF per-segment allocation differ by exactly B·(w−W)", () => {
    // The only structural difference between the two conventions is that BF
    // subtracts the total benchmark return B from each segment's allocation
    // return. So per segment: alloc_BHB − alloc_BF = (w−W)·B.
    const book = makeBook(99, 6);
    const bf = attribute({ ...book, method: "BF" });
    const bhb = attribute({ ...book, method: "BHB" });
    const B = bf.benchmarkReturn;
    for (let i = 0; i < bf.segments.length; i++) {
      const aBf = bf.segments[i];
      const aBhb = bhb.segments[i];
      const expectedDelta = aBhb.activeWeight.times(B);
      expect(
        aBhb.allocation.minus(aBf.allocation).minus(expectedDelta).abs().toNumber(),
      ).toBeLessThan(1e-15);
      // Selection and interaction are convention-independent.
      expect(aBhb.selection.minus(aBf.selection).abs().toNumber()).toBe(0);
      expect(aBhb.interaction.minus(aBf.interaction).abs().toNumber()).toBe(0);
    }
  });

  it("handles a portfolio that underperforms (negative active return)", () => {
    // Underweight the winner, overweight the loser, and pick losers inside.
    const r = attribute({
      method: "BF",
      segments: [
        { id: "win", label: "Winner", portfolioWeight: 0.3, benchmarkWeight: 0.6, portfolioReturn: 0.08, benchmarkReturn: 0.1 },
        { id: "lose", label: "Loser", portfolioWeight: 0.7, benchmarkWeight: 0.4, portfolioReturn: -0.05, benchmarkReturn: -0.02 },
      ],
    });
    expect(r.activeReturn.isNegative()).toBe(true);
    // Still reconciles exactly.
    expect(r.totalEffect.minus(r.activeReturn).abs().toNumber()).toBeLessThan(1e-15);
  });

  it("a single segment held at full weight has zero active return and zero effects", () => {
    const r = attribute({
      segments: [
        { id: "only", label: "Only", portfolioWeight: 1, benchmarkWeight: 1, portfolioReturn: 0.07, benchmarkReturn: 0.07 },
      ],
    });
    expectClose(r.activeReturn, 0);
    expectClose(r.totalEffect, 0);
    expectClose(r.segments[0].allocation, 0);
    expectClose(r.segments[0].selection, 0);
    expectClose(r.segments[0].interaction, 0);
  });
});

describe("multiPeriodAttribution — adversarial Carino edge cases", () => {
  const twoSeg = (pr1: number, br1: number, pr2: number, br2: number): AttributionInput => ({
    segments: [
      { id: "eq", label: "Eq", portfolioWeight: 0.6, benchmarkWeight: 0.5, portfolioReturn: pr1, benchmarkReturn: br1 },
      { id: "fi", label: "FI", portfolioWeight: 0.4, benchmarkWeight: 0.5, portfolioReturn: pr2, benchmarkReturn: br2 },
    ],
  });

  it("reconciles exactly even when one period has zero active return (Carino limit)", () => {
    // Period 2 is constructed so portfolio and benchmark returns are equal,
    // exercising the kₜ = 1/(1+R) limit branch.
    const periods = [
      twoSeg(0.05, 0.03, 0.02, 0.01), // active ≠ 0
      twoSeg(0.04, 0.04, 0.04, 0.04), // R_p = R_b = 0.04 → zero active
    ];
    const m = multiPeriodAttribution({ periods, method: "BF" });
    expect(m.totalEffect.minus(m.activeReturn).abs().toNumber()).toBeLessThan(1e-12);
  });

  it("reconciles exactly when the TOTAL compounded active return is ~zero", () => {
    // Period 1 portfolio beats; period 2 it gives it all back, so the compounded
    // active return is approximately zero — the overall-k limit must stay finite.
    const periods = [
      twoSeg(0.1, 0.05, 0.0, 0.0),
      twoSeg(-0.05, 0.0, 0.0, 0.0),
    ];
    const m = multiPeriodAttribution({ periods, method: "BF" });
    expect(m.totalEffect.minus(m.activeReturn).abs().toNumber()).toBeLessThan(1e-12);
  });

  it("Carino linking reconciles for the BHB convention too", () => {
    const periods = [
      twoSeg(0.06, 0.04, 0.03, 0.02),
      twoSeg(0.02, 0.05, 0.07, 0.04),
      twoSeg(-0.03, -0.01, 0.05, 0.03),
    ];
    const m = multiPeriodAttribution({ periods, method: "BHB" });
    expect(m.totalEffect.minus(m.activeReturn).abs().toNumber()).toBeLessThan(1e-12);
    // Compounded active return matches direct compounding.
    let gp = new Decimal(1);
    let gb = new Decimal(1);
    for (const p of periods) {
      const r = attribute({ ...p, method: "BHB" });
      gp = gp.times(r.portfolioReturn.plus(1));
      gb = gb.times(r.benchmarkReturn.plus(1));
    }
    expectClose(m.activeReturn, gp.minus(gb).toNumber());
  });
});
