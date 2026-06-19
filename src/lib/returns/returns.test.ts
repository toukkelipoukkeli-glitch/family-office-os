import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  annualizeReturn,
  moneyWeightedReturn,
  timeWeightedReturn,
  xirr,
  xnpv,
  type DatedCashflow,
  type ValuationPoint,
} from "./index";

/** Assert a Decimal is within `eps` of `expected` (default 1e-7). */
function expectClose(actual: Decimal, expected: number, eps = 1e-7): void {
  const diff = actual.minus(expected).abs().toNumber();
  expect(
    diff,
    `expected ${actual.toFixed(10)} ≈ ${expected} (|Δ|=${diff})`,
  ).toBeLessThan(eps);
}

describe("xirr — known answers", () => {
  it("solves a non-leap full-year 10% return exactly", () => {
    // -1000 on 2021-01-01, +1100 on 2022-01-01 (365 days). Root = 0.10.
    const r = xirr([
      { date: "2021-01-01", amount: -1000 },
      { date: "2022-01-01", amount: 1100 },
    ]);
    expectClose(r, 0.1);
  });

  it("accounts for leap years via Act/365 (2020 = 366 days)", () => {
    // 100 -> 200 across a leap year: t = 366/365, so r = 2^(365/366) - 1.
    const r = xirr([
      { date: "2020-01-01", amount: -100 },
      { date: "2021-01-01", amount: 200 },
    ]);
    const expected = Math.pow(2, 365 / 366) - 1; // ≈ 0.9962159
    expectClose(r, expected);
  });

  it("handles multiple irregular contributions (oracle from bisection)", () => {
    const r = xirr([
      { date: "2019-01-01", amount: -1000 },
      { date: "2019-07-01", amount: -500 },
      { date: "2020-01-01", amount: 1700 },
    ]);
    expectClose(r, 0.16093584964263574);
  });

  it("returns a negative rate for a loss", () => {
    const r = xirr([
      { date: "2018-01-01", amount: -1000 },
      { date: "2018-12-31", amount: 900 },
    ]);
    expectClose(r, -0.10026046907102276);
  });

  it("is order-independent (sorting by date is implicit in discounting)", () => {
    const flows: DatedCashflow[] = [
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2008-02-15", amount: 3250 },
      { date: "2008-04-01", amount: 2750 },
    ];
    const shuffled = [...flows].reverse();
    const a = xirr(flows);
    const b = xirr(shuffled);
    expectClose(a, b.toNumber());
    // NPV at the solved rate is ~0.
    expectClose(xnpv(a, flows), 0, 1e-4);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const r = xirr([
      { date: new Date(Date.UTC(2021, 0, 1)), amount: -1000 },
      { date: new Date(Date.UTC(2022, 0, 1)), amount: 1100 },
    ]);
    expectClose(r, 0.1);
  });

  it("preserves Decimal-input precision in amounts", () => {
    const r = xirr([
      { date: "2021-01-01", amount: new Decimal("-1000.00") },
      { date: "2022-01-01", amount: new Decimal("1100.00") },
    ]);
    expectClose(r, 0.1);
  });

  it("converges for a high (>100%) rate", () => {
    // Triple in one non-leap year => 200%.
    const r = xirr([
      { date: "2021-01-01", amount: -100 },
      { date: "2022-01-01", amount: 300 },
    ]);
    expectClose(r, 2.0);
  });

  it("converges for a deeply negative rate", () => {
    const r = xirr([
      { date: "2021-01-01", amount: -1000 },
      { date: "2022-01-01", amount: 100 },
    ]);
    expectClose(r, -0.9); // lose 90%
  });
});

describe("xirr — validation", () => {
  it("rejects fewer than two cashflows", () => {
    expect(() => xirr([{ date: "2021-01-01", amount: -1 }])).toThrow(
      /at least two/,
    );
  });

  it("rejects all-positive or all-negative series", () => {
    expect(() =>
      xirr([
        { date: "2021-01-01", amount: 100 },
        { date: "2022-01-01", amount: 200 },
      ]),
    ).toThrow(/positive and at least one negative|positive and one negative/);
  });

  it("rejects malformed dates", () => {
    expect(() =>
      xirr([
        { date: "2021-13-01", amount: -1 },
        { date: "2022-01-01", amount: 2 },
      ]),
    ).toThrow(/calendar date|YYYY-MM-DD/);
  });

  it("rejects non-finite amounts", () => {
    expect(() =>
      xirr([
        { date: "2021-01-01", amount: Infinity },
        { date: "2022-01-01", amount: 2 },
      ]),
    ).toThrow(/non-finite/);
  });
});

describe("xnpv", () => {
  it("equals the undiscounted sum at rate 0", () => {
    const cfs: DatedCashflow[] = [
      { date: "2021-01-01", amount: -1000 },
      { date: "2022-01-01", amount: 1100 },
    ];
    expectClose(xnpv(0, cfs), 100);
  });

  it("is zero at the XIRR rate", () => {
    const cfs: DatedCashflow[] = [
      { date: "2019-01-01", amount: -1000 },
      { date: "2019-07-01", amount: -500 },
      { date: "2020-01-01", amount: 1700 },
    ];
    const r = xirr(cfs);
    expectClose(xnpv(r, cfs), 0, 1e-6);
  });

  it("rejects rates at or below -100%", () => {
    expect(() =>
      xnpv(-1, [
        { date: "2021-01-01", amount: -1 },
        { date: "2022-01-01", amount: 2 },
      ]),
    ).toThrow(/greater than -1/);
  });
});

describe("timeWeightedReturn — known answers", () => {
  it("chains two equal +10% sub-periods to 21%", () => {
    const points: ValuationPoint[] = [
      { value: 100 },
      { value: 110 },
      { value: 121 },
    ];
    const { twr, growthFactor, subPeriodReturns } = timeWeightedReturn(points);
    expectClose(twr, 0.21);
    expectClose(growthFactor, 1.21);
    expect(subPeriodReturns).toHaveLength(2);
    expectClose(subPeriodReturns[0], 0.1);
    expectClose(subPeriodReturns[1], 0.1);
  });

  it("neutralizes a mid-period deposit (deposit is not a gain)", () => {
    // Start 100, grow 20% to 120, then deposit 100 -> end 220.
    const points: ValuationPoint[] = [
      { value: 100 },
      { value: 220, cashflow: 100 },
    ];
    expectClose(timeWeightedReturn(points).twr, 0.2);
  });

  it("neutralizes a withdrawal (withdrawal is not a loss)", () => {
    // Start 100, grow 10% to 110, withdraw 50 -> end 60.
    const points: ValuationPoint[] = [
      { value: 100 },
      { value: 60, cashflow: -50 },
    ];
    expectClose(timeWeightedReturn(points).twr, 0.1);
  });

  it("differs from MWR when a large cashflow lands before a strong period", () => {
    // TWR ignores the timing; both sub-periods are +10% => 21%.
    const points: ValuationPoint[] = [
      { value: 1000 },
      { value: 2100, cashflow: 1000 }, // +10% on 1000, then +1000 deposit
      { value: 2310, cashflow: 0 }, // +10% on 2100
    ];
    expectClose(timeWeightedReturn(points).twr, 0.21);
  });

  it("returns a loss correctly", () => {
    const points: ValuationPoint[] = [{ value: 100 }, { value: 80 }];
    expectClose(timeWeightedReturn(points).twr, -0.2);
  });

  it("requires at least two points", () => {
    expect(() => timeWeightedReturn([{ value: 100 }])).toThrow(
      /at least two/,
    );
  });

  it("throws when a sub-period opens at zero value", () => {
    expect(() =>
      timeWeightedReturn([{ value: 0 }, { value: 100, cashflow: 100 }]),
    ).toThrow(/zero/);
  });

  it("works with Decimal string inputs without float loss", () => {
    const points: ValuationPoint[] = [
      { value: "100.10" },
      { value: "110.11", cashflow: "0" },
    ];
    // (110.11 - 100.10)/100.10 = 10.01/100.10 = 0.1
    expectClose(timeWeightedReturn(points).twr, 0.1, 1e-9);
  });
});

describe("moneyWeightedReturn — known answers", () => {
  it("equals the simple return with no interim flows over a full year", () => {
    const r = moneyWeightedReturn({
      openingValue: 1000,
      openingDate: "2021-01-01",
      endingValue: 1100,
      endingDate: "2022-01-01",
    });
    expectClose(r, 0.1);
  });

  it("dollar-weights a mid-year contribution (oracle from XIRR)", () => {
    // Open 1000 @ Jan; deposit 500 @ Jul; end 1700 @ next Jan.
    const r = moneyWeightedReturn({
      openingValue: 1000,
      openingDate: "2019-01-01",
      flows: [{ date: "2019-07-01", contribution: 500 }],
      endingValue: 1700,
      endingDate: "2020-01-01",
    });
    expectClose(r, 0.16093584964263574, 1e-6);
  });

  it("treats withdrawals (negative contributions) as inflows to the investor", () => {
    // Open 1000, withdraw 200 mid-year, end 880 -> equivalent XIRR.
    const cfs: DatedCashflow[] = [
      { date: "2021-01-01", amount: -1000 },
      { date: "2021-07-01", amount: 200 },
      { date: "2022-01-01", amount: 880 },
    ];
    const expected = xirr(cfs);
    const r = moneyWeightedReturn({
      openingValue: 1000,
      openingDate: "2021-01-01",
      flows: [{ date: "2021-07-01", contribution: -200 }],
      endingValue: 880,
      endingDate: "2022-01-01",
    });
    expectClose(r, expected.toNumber(), 1e-6);
  });

  it("differs from TWR when a big contribution lands before the strong sub-period", () => {
    // Sub-period 1 is flat (0%); sub-period 2 is +50%. A large deposit right
    // before the strong period means the investor's dollars are concentrated in
    // the winning sub-period, so MWR (dollar-weighted) >> TWR (time-weighted).
    //   open 100 -> still 100 (0%) -> deposit 900 -> 1000 grows +50% -> 1500
    const twr = timeWeightedReturn([
      { value: 100 },
      { value: 1000, cashflow: 900 }, // 0% gain on the first 100, then +900
      { value: 1500, cashflow: 0 }, // +50% on 1000
    ]).twr;
    const mwr = moneyWeightedReturn({
      openingValue: 100,
      openingDate: "2021-01-01",
      flows: [{ date: "2021-07-01", contribution: 900 }],
      endingValue: 1500,
      endingDate: "2022-01-01",
    });
    // TWR is the geometric chain (1.0 * 1.5 - 1 = 0.5).
    expectClose(twr, 0.5, 1e-9);
    // MWR is much larger: nearly all capital captured the +50% half-year,
    // which annualizes well above 50%.
    expect(mwr.toNumber()).toBeGreaterThan(0.9);
    expect(mwr.minus(twr).abs().toNumber()).toBeGreaterThan(0.3);
  });

  it("rejects a negative opening value", () => {
    expect(() =>
      moneyWeightedReturn({
        openingValue: -1,
        openingDate: "2021-01-01",
        endingValue: 1,
        endingDate: "2022-01-01",
      }),
    ).toThrow(/openingValue/);
  });
});

describe("annualizeReturn", () => {
  it("de-annualizes a 21% two-year return to ~10%/yr", () => {
    expectClose(annualizeReturn(0.21, 2), 0.1, 1e-9);
  });

  it("is the identity over exactly one year", () => {
    expectClose(annualizeReturn(0.1, 1), 0.1, 1e-12);
  });

  it("annualizes a 6-month 5% return (>5%/yr by compounding)", () => {
    const a = annualizeReturn(0.05, 0.5);
    expectClose(a, Math.pow(1.05, 2) - 1, 1e-9); // 0.1025
  });

  it("rejects non-positive horizons", () => {
    expect(() => annualizeReturn(0.1, 0)).toThrow(/positive/);
    expect(() => annualizeReturn(0.1, -1)).toThrow(/positive/);
  });

  it("rejects a total return at or below -100%", () => {
    expect(() => annualizeReturn(-1, 2)).toThrow(/greater than -100%/);
  });
});

describe("cross-checks (TWR vs MWR identity cases)", () => {
  it("TWR == MWR when there are no interim cashflows", () => {
    const twr = timeWeightedReturn([{ value: 1000 }, { value: 1234 }]).twr;
    const mwr = moneyWeightedReturn({
      openingValue: 1000,
      openingDate: "2021-01-01",
      endingValue: 1234,
      endingDate: "2022-01-01",
    });
    // Same 365-day period, no flows: both equal the simple total return.
    expectClose(twr, 0.234, 1e-9);
    expectClose(mwr, 0.234, 1e-6);
  });
});

describe("input hardening / edge cases", () => {
  it("xirr: a Date with a nonzero time component matches the ISO string", () => {
    // Same calendar days; one expressed as Dates carrying a UTC time-of-day.
    const fromStrings = xirr([
      { date: "2021-01-01", amount: -1000 },
      { date: "2022-01-01", amount: 1100 },
    ]);
    const fromDates = xirr([
      { date: new Date(Date.UTC(2021, 0, 1, 18, 30, 0)), amount: -1000 },
      { date: new Date(Date.UTC(2022, 0, 1, 6, 15, 0)), amount: 1100 },
    ]);
    // Both normalize to UTC midnight => identical year fraction => identical rate.
    expectClose(fromDates, fromStrings.toNumber(), 1e-12);
    expectClose(fromDates, 0.1);
  });

  it("xnpv: rejects a non-finite amount instead of returning NaN", () => {
    expect(() =>
      xnpv(0.1, [
        { date: "2021-01-01", amount: new Decimal(Infinity) },
        { date: "2022-01-01", amount: 1100 },
      ]),
    ).toThrow(/non-finite/);
  });

  it("annualizeReturn: rejects non-finite horizons", () => {
    expect(() => annualizeReturn(0.1, Infinity)).toThrow(/finite/);
    expect(() => annualizeReturn(0.1, Number.NaN)).toThrow(/finite/);
  });

  it("mwr: rejects a zero opening value", () => {
    expect(() =>
      moneyWeightedReturn({
        openingValue: 0,
        openingDate: "2021-01-01",
        endingValue: 1100,
        endingDate: "2022-01-01",
      }),
    ).toThrow(/openingValue/);
  });

  it("mwr: rejects a flow dated before the opening date", () => {
    expect(() =>
      moneyWeightedReturn({
        openingValue: 1000,
        openingDate: "2021-01-01",
        flows: [{ date: "2020-12-31", contribution: 100 }],
        endingValue: 1200,
        endingDate: "2022-01-01",
      }),
    ).toThrow(/within/);
  });

  it("mwr: rejects a flow dated after the ending date", () => {
    expect(() =>
      moneyWeightedReturn({
        openingValue: 1000,
        openingDate: "2021-01-01",
        flows: [{ date: "2022-01-02", contribution: 100 }],
        endingValue: 1200,
        endingDate: "2022-01-01",
      }),
    ).toThrow(/within/);
  });

  it("mwr: rejects an ending date before the opening date", () => {
    expect(() =>
      moneyWeightedReturn({
        openingValue: 1000,
        openingDate: "2022-01-01",
        endingValue: 1100,
        endingDate: "2021-01-01",
      }),
    ).toThrow(/on or after/);
  });

  it("mwr: accepts flows exactly on the opening and ending boundaries", () => {
    const mwr = moneyWeightedReturn({
      openingValue: 1000,
      openingDate: "2021-01-01",
      flows: [
        { date: "2021-01-01", contribution: 100 },
        { date: "2022-01-01", contribution: -50 },
      ],
      endingValue: 1200,
      endingDate: "2022-01-01",
    });
    expect(mwr.isFinite()).toBe(true);
  });
});
