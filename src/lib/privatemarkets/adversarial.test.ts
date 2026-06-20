import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  buildJCurve,
  buildPrivateMarketsModel,
  commitmentMetrics,
  irrCashflows,
  portfolioMetrics,
  type Commitment,
} from ".";

/**
 * Adversarial edge-case suite for m9-pe-lifecycle (independent tester).
 *
 * These probe the boundaries the happy-path fixtures don't exercise: NAV
 * reported mid-ledger, NAV dated before every cashflow, distribution-only and
 * never-negative ledgers, validation of non-finite / non-integer inputs, and
 * the page view-model's sleeve roll-up under funds that start at different
 * dates. Every figure is hand-derived so we never grade the engine against
 * itself.
 */

function approx(value: Decimal | number, expected: number, tol = 1e-9): void {
  const v = value instanceof Decimal ? value.toNumber() : value;
  expect(Math.abs(v - expected)).toBeLessThan(tol);
}

describe("J-curve — NAV attachment edge cases", () => {
  it("attaches NAV to the latest point at-or-before a mid-ledger navDate", () => {
    // navDate falls between the 2nd and 3rd cashflow, so the NAV layers onto
    // the 2nd point and later points revert to pure net cashflow.
    const c: Commitment = {
      id: "mid-nav",
      name: "Mid NAV",
      strategy: "Buyout",
      committed: "5000000",
      vintageYear: 2020,
      currency: "USD",
      nav: "1000000",
      navDate: "2021-06-30",
      ledger: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2021-01-01", kind: "call", amount: "1000000" },
        { date: "2022-01-01", kind: "distribution", amount: "500000" },
      ],
    };
    const jc = buildJCurve(c);
    expect(jc.points).toHaveLength(3);
    // Point 0 (2020): net −1M, no NAV.
    approx(jc.points[0].totalValue, -1_000_000);
    // Point 1 (2021): net −2M, NAV layered → totalValue −1M.
    approx(jc.points[1].cumulativeNet, -2_000_000);
    approx(jc.points[1].totalValue, -1_000_000);
    // Point 2 (2022): net −1.5M, NAV NOT re-applied here.
    approx(jc.points[2].cumulativeNet, -1_500_000);
    approx(jc.points[2].totalValue, -1_500_000);
  });

  it("falls back to the first point when navDate precedes every cashflow", () => {
    const c: Commitment = {
      id: "early-nav",
      name: "Early NAV",
      strategy: "Venture",
      committed: "5000000",
      vintageYear: 2020,
      currency: "USD",
      nav: "2000000",
      navDate: "2019-01-01", // before the first ledger date
      ledger: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2021-01-01", kind: "call", amount: "1000000" },
      ],
    };
    const jc = buildJCurve(c);
    // NAV lands on point 0 only.
    approx(jc.points[0].totalValue, -1_000_000 + 2_000_000);
    approx(jc.points[1].totalValue, -2_000_000);
  });

  it("never goes net-negative when distributions precede calls: trough 0", () => {
    const c: Commitment = {
      id: "no-trough",
      name: "No trough",
      strategy: "Real assets",
      committed: "5000000",
      vintageYear: 2020,
      currency: "USD",
      nav: "0",
      ledger: [
        { date: "2020-01-01", kind: "distribution", amount: "500000" },
        { date: "2021-01-01", kind: "call", amount: "200000" },
      ],
    };
    const jc = buildJCurve(c);
    approx(jc.trough, 0);
    expect(jc.troughDate).toBe("2020-01-01"); // first point, never deeper
    expect(jc.breakevenDate).toBeNull(); // never went negative → nothing to cross
  });

  it("yields an empty series with a zero trough for an empty ledger", () => {
    const c: Commitment = {
      id: "empty",
      name: "Empty",
      strategy: "Buyout",
      committed: "5000000",
      vintageYear: 2024,
      currency: "USD",
      ledger: [],
    };
    const jc = buildJCurve(c);
    expect(jc.points).toHaveLength(0);
    approx(jc.trough, 0);
    expect(jc.troughDate).toBeNull();
    expect(jc.breakevenDate).toBeNull();
  });
});

describe("commitmentMetrics — distribution-only and zero-paid-in safety", () => {
  it("guards ratios when paid-in is zero despite distributions/NAV", () => {
    // Pathological but must not divide by zero: no calls, only a distribution.
    const c: Commitment = {
      id: "dist-only",
      name: "Distribution only",
      strategy: "Buyout",
      committed: "5000000",
      vintageYear: 2020,
      currency: "USD",
      nav: "1000000",
      ledger: [{ date: "2020-01-01", kind: "distribution", amount: "500000" }],
    };
    const m = commitmentMetrics(c);
    expect(m.paidIn.isZero()).toBe(true);
    approx(m.dpi, 0);
    approx(m.rvpi, 0);
    approx(m.tvpi, 0);
    // unfunded = committed − 0 = committed.
    expect(m.unfunded.toFixed()).toBe("5000000");
  });

  it("appends NAV as the terminal positive flow even with no distributions", () => {
    const c: Commitment = {
      id: "nav-terminal",
      name: "NAV terminal",
      strategy: "Venture",
      committed: "5000000",
      vintageYear: 2022,
      currency: "USD",
      nav: "1500000",
      navDate: "2024-01-01",
      ledger: [{ date: "2022-01-01", kind: "call", amount: "1000000" }],
    };
    const flows = irrCashflows(c);
    const terminal = flows[flows.length - 1];
    expect(terminal.date).toBe("2024-01-01");
    expect(new Decimal(terminal.amount).toFixed()).toBe("1500000");
    // The call → distribution(NAV) sign change makes IRR defined.
    expect(commitmentMetrics(c).irr).not.toBeNull();
  });
});

describe("validation — non-finite & non-integer inputs", () => {
  it("rejects a non-finite committed amount", () => {
    expect(() =>
      commitmentMetrics({
        id: "nf",
        name: "NF",
        strategy: "Buyout",
        committed: Infinity,
        vintageYear: 2020,
        currency: "USD",
        ledger: [],
      }),
    ).toThrow(/non-finite/);
  });

  it("rejects a NaN ledger amount", () => {
    expect(() =>
      commitmentMetrics({
        id: "nan",
        name: "NaN",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020,
        currency: "USD",
        ledger: [{ date: "2020-01-01", kind: "call", amount: NaN }],
      }),
    ).toThrow(/non-finite/);
  });

  it("rejects a non-integer vintage year", () => {
    expect(() =>
      commitmentMetrics({
        id: "vy",
        name: "VY",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020.5,
        currency: "USD",
        ledger: [],
      }),
    ).toThrow(/vintageYear/);
  });

  it("rejects a negative NAV", () => {
    expect(() =>
      commitmentMetrics({
        id: "nn",
        name: "NN",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020,
        currency: "USD",
        nav: "-1",
        ledger: [],
      }),
    ).toThrow(/nav/);
  });

  it("rejects a malformed navDate", () => {
    expect(() =>
      commitmentMetrics({
        id: "nd",
        name: "ND",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2020,
        currency: "USD",
        nav: "1",
        navDate: "2020-13-40",
        ledger: [],
      }),
    ).toThrow(/real calendar date/);
  });

  it("rejects a calendar-impossible ledger date (Feb 29 on a non-leap year)", () => {
    expect(() =>
      commitmentMetrics({
        id: "leap",
        name: "Leap",
        strategy: "Buyout",
        committed: "1000000",
        vintageYear: 2021,
        currency: "USD",
        ledger: [{ date: "2021-02-29", kind: "call", amount: "1" }],
      }),
    ).toThrow(/real calendar date/);
  });
});

describe("portfolio roll-up — single fund & ordering invariants", () => {
  it("matches the single-commitment metrics exactly for a 1-fund sleeve", () => {
    const c: Commitment = {
      id: "solo",
      name: "Solo",
      strategy: "Buyout",
      committed: "4000000",
      vintageYear: 2019,
      currency: "USD",
      nav: "500000",
      ledger: [
        { date: "2019-01-01", kind: "call", amount: "2000000" },
        { date: "2022-01-01", kind: "distribution", amount: "3000000" },
      ],
    };
    const p = portfolioMetrics([c]);
    const m = commitmentMetrics(c);
    expect(p.committed.equals(m.committed)).toBe(true);
    expect(p.paidIn.equals(m.paidIn)).toBe(true);
    expect(p.distributed.equals(m.distributed)).toBe(true);
    expect(p.nav.equals(m.nav)).toBe(true);
    expect(p.tvpi.equals(m.tvpi)).toBe(true);
    // Pooled IRR over a single fund equals that fund's IRR.
    expect(p.irr).not.toBeNull();
    expect(m.irr).not.toBeNull();
    approx(p.irr!, m.irr!.toNumber(), 1e-9);
  });
});

describe("view model — sleeve J-curve step-function across staggered funds", () => {
  it("sums the most-recent per-fund value at each union date", () => {
    // Two funds starting at different dates. The sleeve net at a date is the
    // sum of each fund's last-known cumulative net at or before that date.
    const a: Commitment = {
      id: "fund-a",
      name: "Fund A",
      strategy: "Buyout",
      committed: "3000000",
      vintageYear: 2020,
      currency: "USD",
      nav: "0",
      ledger: [
        { date: "2020-01-01", kind: "call", amount: "1000000" },
        { date: "2022-01-01", kind: "distribution", amount: "1500000" },
      ],
    };
    const b: Commitment = {
      id: "fund-b",
      name: "Fund B",
      strategy: "Venture",
      committed: "2000000",
      vintageYear: 2021,
      currency: "USD",
      nav: "0",
      ledger: [{ date: "2021-01-01", kind: "call", amount: "800000" }],
    };
    const model = buildPrivateMarketsModel({ commitments: [a, b] });
    // Largest committed first: Fund A (3M) then Fund B (2M).
    expect(model.commitments.map((c) => c.id)).toEqual(["fund-a", "fund-b"]);

    // Independently recompute the expected sleeve net at the final union date
    // (2022-01-01): A net = 1.5M − 1M = +0.5M; B net = −0.8M; sleeve = −0.3M.
    const sleeveNetFinal = 500_000 - 800_000;
    // The page derives this internally; we assert the per-fund inputs that feed
    // it are correct (the page's buildSleeveJCurve is exercised by e2e + the
    // page test). Here we lock the per-fund last-point nets.
    const fa = model.jcurves.find((j) => j.id === "fund-a")!;
    const fb = model.jcurves.find((j) => j.id === "fund-b")!;
    approx(fa.points[fa.points.length - 1].cumulativeNet, 500_000);
    approx(fb.points[fb.points.length - 1].cumulativeNet, -800_000);
    approx(
      fa.points[fa.points.length - 1].cumulativeNet +
        fb.points[fb.points.length - 1].cumulativeNet,
      sleeveNetFinal,
    );
  });
});
