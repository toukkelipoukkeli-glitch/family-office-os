import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { xnpv } from "@/lib/returns";

import {
  buildJCurve,
  commitmentIrr,
  commitmentMetrics,
  irrCashflows,
  portfolioIrr,
  portfolioMetrics,
  type Commitment,
} from ".";
import {
  buyoutFund,
  realAssetsFund,
  seededCommitments,
  ventureFund,
} from "./fixtures";

/**
 * Oracle: every headline figure below is hand-computed from the fixture ledger
 * (committed / calls / distributions / NAV) and cross-checked independently —
 * IRRs are verified by feeding the solved rate back through XNPV and asserting
 * the net present value is ~0 (the defining property of an IRR), so we never
 * grade the engine against itself.
 */

const TOL = 1e-8;

function approx(value: Decimal | number, expected: number, tol = TOL): void {
  const v = value instanceof Decimal ? value.toNumber() : value;
  expect(Math.abs(v - expected)).toBeLessThan(tol);
}

describe("commitmentMetrics — multiples & unfunded", () => {
  it("buyout fund: hand-computed paid-in / distributed / NAV multiples", () => {
    const m = commitmentMetrics(buyoutFund);
    expect(m.paidIn.toFixed()).toBe("9000000");
    expect(m.distributed.toFixed()).toBe("11500000");
    expect(m.nav.toFixed()).toBe("4000000");
    expect(m.unfunded.toFixed()).toBe("1000000"); // 10M committed − 9M called
    approx(m.dpi, 11_500_000 / 9_000_000); // 1.2777…
    approx(m.rvpi, 4_000_000 / 9_000_000); // 0.4444…
    approx(m.tvpi, (11_500_000 + 4_000_000) / 9_000_000); // 1.7222…
    // MOIC is defined identically to TVPI for an LP.
    expect(m.moic.equals(m.tvpi)).toBe(true);
  });

  it("venture fund still in the J-curve: DPI 0, TVPI = RVPI", () => {
    const m = commitmentMetrics(ventureFund);
    expect(m.paidIn.toFixed()).toBe("3500000");
    expect(m.distributed.toFixed()).toBe("0");
    approx(m.dpi, 0);
    approx(m.rvpi, 4_200_000 / 3_500_000); // 1.2
    approx(m.tvpi, 1.2);
    expect(m.unfunded.toFixed()).toBe("4500000"); // 8M − 3.5M
  });

  it("real-assets fund: steady distributions, fully drawn", () => {
    const m = commitmentMetrics(realAssetsFund);
    expect(m.paidIn.toFixed()).toBe("6000000");
    expect(m.distributed.toFixed()).toBe("7800000");
    expect(m.unfunded.toFixed()).toBe("0"); // fully drawn
    approx(m.dpi, 7_800_000 / 6_000_000); // 1.3
    approx(m.rvpi, 1_500_000 / 6_000_000); // 0.25
    approx(m.tvpi, 1.55);
  });

  it("clamps unfunded at zero when over-called (no negative unfunded)", () => {
    const overCalled: Commitment = {
      id: "x",
      name: "X",
      strategy: "Buyout",
      committed: "1000000",
      vintageYear: 2020,
      currency: "USD",
      ledger: [{ date: "2020-01-01", kind: "call", amount: "1200000" }],
    };
    expect(commitmentMetrics(overCalled).unfunded.toFixed()).toBe("0");
  });

  it("defaults NAV to zero and returns zero multiples before any call", () => {
    const empty: Commitment = {
      id: "e",
      name: "E",
      strategy: "Venture",
      committed: "5000000",
      vintageYear: 2024,
      currency: "USD",
      ledger: [],
    };
    const m = commitmentMetrics(empty);
    expect(m.paidIn.isZero()).toBe(true);
    expect(m.nav.isZero()).toBe(true);
    approx(m.dpi, 0);
    approx(m.rvpi, 0);
    approx(m.tvpi, 0);
    expect(m.irr).toBeNull(); // no sign change → undefined IRR
    expect(m.unfunded.toFixed()).toBe("5000000");
  });
});

describe("commitment IRR — dated cashflow XIRR", () => {
  it("buyout IRR ≈ 12.03%/yr and XNPV at that rate is ~0 (independent check)", () => {
    const irr = commitmentIrr(buyoutFund);
    expect(irr).not.toBeNull();
    approx(irr!, 0.1203025256, 1e-6);
    // Independent oracle: the IRR must zero out the NPV of the same flows.
    const npv = xnpv(irr!, irrCashflows(buyoutFund));
    approx(npv, 0, 1e-2);
  });

  it("treats the residual NAV as a terminal positive flow on the NAV date", () => {
    const flows = irrCashflows(buyoutFund);
    const navFlow = flows[flows.length - 1];
    expect(navFlow.date).toBe("2024-06-30");
    expect(new Decimal(navFlow.amount).toFixed()).toBe("4000000");
    // Calls are negative, distributions positive.
    const calls = flows.filter((f) => new Decimal(f.amount).isNegative());
    expect(calls).toHaveLength(4);
  });

  it("matches a textbook single call/distribution IRR exactly", () => {
    // 1,000,000 called on 2020-01-01, 1,200,000 distributed exactly one year
    // later (2021-01-01, a leap-day-spanning 366-day year). XIRR uses Act/365,
    // so (1+r)^(366/365) = 1.2 → r = 1.2^(365/366) − 1.
    const c: Commitment = {
      id: "tb",
      name: "Textbook",
      strategy: "Buyout",
      committed: "1000000",
      vintageYear: 2020,
      currency: "USD",
      ledger: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2021-01-01", kind: "distribution", amount: "1200000" },
      ],
    };
    const irr = commitmentIrr(c);
    const expected = Math.pow(1.2, 365 / 366) - 1;
    approx(irr!, expected, 1e-7);
  });

  it("returns null when there is no positive flow (only calls, no NAV)", () => {
    const c: Commitment = {
      id: "calls-only",
      name: "Calls only",
      strategy: "Venture",
      committed: "5000000",
      vintageYear: 2023,
      currency: "USD",
      ledger: [
        { date: "2023-01-01", kind: "call", amount: "1000000" },
        { date: "2023-06-01", kind: "call", amount: "1000000" },
      ],
    };
    expect(commitmentIrr(c)).toBeNull();
  });
});

describe("J-curve pacing", () => {
  it("buyout J-curve: dives to −9M trough then breaks even after harvest", () => {
    const jc = buildJCurve(buyoutFund);
    expect(jc.points).toHaveLength(7);
    // After all 4 calls (last call 2020-06-15) and before any distribution the
    // LP is net −9M out of pocket — the bottom of the J.
    approx(jc.trough, -9_000_000);
    expect(jc.troughDate).toBe("2020-06-15");
    // Cumulative net first turns non-negative once distributions exceed calls:
    // 1.5M + 4M + 6M = 11.5M > 9M on 2023-11-30.
    expect(jc.breakevenDate).toBe("2023-11-30");

    const last = jc.points[jc.points.length - 1];
    approx(last.cumulativeNet, 11_500_000 - 9_000_000); // +2.5M realised
    approx(last.totalValue, 11_500_000 - 9_000_000 + 4_000_000); // + NAV
  });

  it("venture J-curve never breaks even (still drawing, no distributions)", () => {
    const jc = buildJCurve(ventureFund);
    expect(jc.breakevenDate).toBeNull();
    approx(jc.trough, -3_500_000);
    // Total value layers the NAV on top once reported.
    const last = jc.points[jc.points.length - 1];
    approx(last.cumulativeNet, -3_500_000);
    approx(last.totalValue, -3_500_000 + 4_200_000); // +700k
  });

  it("collapses multiple cashflows on the same date into one point", () => {
    const c: Commitment = {
      id: "same-day",
      name: "Same day",
      strategy: "Buyout",
      committed: "3000000",
      vintageYear: 2021,
      currency: "USD",
      nav: "0",
      ledger: [
        { date: "2021-01-01", kind: "call", amount: "1000000" },
        { date: "2021-01-01", kind: "call", amount: "500000" },
        { date: "2022-01-01", kind: "distribution", amount: "2000000" },
      ],
    };
    const jc = buildJCurve(c);
    expect(jc.points).toHaveLength(2);
    approx(jc.points[0].cumulativeCalled, 1_500_000);
    approx(jc.points[0].cumulativeNet, -1_500_000);
    approx(jc.points[1].cumulativeNet, 500_000);
  });

  it("is robust to out-of-order ledger entries (sorted internally)", () => {
    const shuffled: Commitment = {
      ...buyoutFund,
      ledger: [...buyoutFund.ledger].reverse(),
    };
    const a = buildJCurve(buyoutFund);
    const b = buildJCurve(shuffled);
    expect(b.points.map((p) => p.date)).toEqual(a.points.map((p) => p.date));
    approx(b.trough, a.trough.toNumber());
  });
});

describe("portfolio roll-up", () => {
  it("aggregates the seeded sleeve to hand-computed totals", () => {
    const p = portfolioMetrics(seededCommitments);
    expect(p.count).toBe(3);
    expect(p.committed.toFixed()).toBe("24000000"); // 10 + 8 + 6
    expect(p.paidIn.toFixed()).toBe("18500000"); // 9 + 3.5 + 6
    expect(p.distributed.toFixed()).toBe("19300000"); // 11.5 + 0 + 7.8
    expect(p.nav.toFixed()).toBe("9700000"); // 4 + 4.2 + 1.5
    expect(p.unfunded.toFixed()).toBe("5500000"); // 1 + 4.5 + 0
    approx(p.dpi, 19_300_000 / 18_500_000);
    approx(p.rvpi, 9_700_000 / 18_500_000);
    approx(p.tvpi, (19_300_000 + 9_700_000) / 18_500_000); // 1.5675…
  });

  it("pooled IRR zeroes out the combined NPV (independent check)", () => {
    const irr = portfolioIrr(seededCommitments);
    expect(irr).not.toBeNull();
    const allFlows = seededCommitments.flatMap((c) => irrCashflows(c));
    approx(xnpv(irr!, allFlows), 0, 1e-2);
  });

  it("rejects a mixed-currency sleeve", () => {
    const eur: Commitment = { ...realAssetsFund, id: "eur", currency: "EUR" };
    expect(() => portfolioMetrics([buyoutFund, eur])).toThrow(/currency/i);
  });

  it("requires at least one commitment", () => {
    expect(() => portfolioMetrics([])).toThrow();
  });
});

describe("validation", () => {
  it("rejects a non-positive committed amount", () => {
    expect(() =>
      commitmentMetrics({
        id: "z",
        name: "Z",
        strategy: "Buyout",
        committed: "0",
        vintageYear: 2020,
        currency: "USD",
        ledger: [],
      }),
    ).toThrow(/positive/);
  });

  it("rejects malformed ledger dates", () => {
    expect(() =>
      commitmentMetrics({
        id: "z",
        name: "Z",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020,
        currency: "USD",
        ledger: [{ date: "2020/01/01", kind: "call", amount: "1" }],
      }),
    ).toThrow(/ISO/);
  });

  it("rejects negative ledger magnitudes", () => {
    expect(() =>
      commitmentMetrics({
        id: "z",
        name: "Z",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020,
        currency: "USD",
        ledger: [{ date: "2020-01-01", kind: "call", amount: "-1" }],
      }),
    ).toThrow(/non-negative/);
  });
});
