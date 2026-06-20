import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { compoundReturn } from "@/lib/benchmark";

import {
  MANAGERS,
  PERIODS_PER_YEAR,
} from "./fixtures";
import {
  compositeScore,
  DEFAULT_SCORE_WEIGHTS,
  feeDrag,
  ManagerError,
  netGross,
  relative,
  scoreManager,
  scoreRoster,
  type Manager,
} from "./scorecard";

const OPTS = { periodsPerYear: PERIODS_PER_YEAR };

function find(id: string): Manager {
  const m = MANAGERS.find((x) => x.id === id);
  if (!m) throw new Error(`no fixture ${id}`);
  return m;
}

describe("netGross — hand-computable cases", () => {
  it("with zero fees, net equals gross exactly", () => {
    const m: Manager = {
      id: "z",
      name: "Zero-fee",
      strategy: "test",
      vintage: 2020,
      aum: 100,
      fees: { managementFee: 0, fundExpenses: 0, carry: 0, hurdle: 0 },
      grossReturns: [0.05, -0.02, 0.03, 0.01],
      benchmarkReturns: [0, 0, 0, 0],
    };
    const ng = netGross(m, { periodsPerYear: 4 });
    expect(ng.netReturns).toEqual(ng.grossReturns);
    expect(ng.netTotal.toNumber()).toBeCloseTo(ng.grossTotal.toNumber(), 12);
    expect(ng.totalCarryFraction.toNumber()).toBe(0);
  });

  it("deducts a flat pro-rated management+expense charge each period", () => {
    // 2.4% annual mgmt+exp over 12 periods => 0.2% per period.
    const m: Manager = {
      id: "f",
      name: "Flat fee",
      strategy: "test",
      vintage: 2020,
      aum: 100,
      fees: { managementFee: 0.02, fundExpenses: 0.004, carry: 0, hurdle: 0 },
      grossReturns: [0.01, 0.01, 0.01],
      benchmarkReturns: [0, 0, 0],
    };
    const ng = netGross(m, { periodsPerYear: 12 });
    const perPeriod = 0.024 / 12; // 0.002
    expect(ng.periodFeeRate).toBeCloseTo(perPeriod, 12);
    for (const n of ng.netReturns) {
      expect(n).toBeCloseTo(0.01 - perPeriod, 12);
    }
    expect(ng.totalCarryFraction.toNumber()).toBe(0);
  });

  it("charges carry only on gross profit above the hurdle at the year boundary", () => {
    // One full year (4 periods), 20% carry over an 8% hurdle, no mgmt fees so we
    // can isolate the carry. Gross compounds to exactly (1.05^... ) — use flat 5%.
    const m: Manager = {
      id: "c",
      name: "Carry only",
      strategy: "test",
      vintage: 2020,
      aum: 100,
      fees: { managementFee: 0, fundExpenses: 0, carry: 0.2, hurdle: 0.08 },
      grossReturns: [0.05, 0.05, 0.05, 0.05],
      benchmarkReturns: [0, 0, 0, 0],
    };
    const ng = netGross(m, { periodsPerYear: 4 });
    const grossWealth = new Decimal(1.05).pow(4); // ~1.2155
    const yearGrowth = grossWealth.minus(1); // ~0.2155
    const excessOverHurdle = yearGrowth.minus(0.08); // hurdle full year => 0.08
    const carryFraction = excessOverHurdle.times(0.2);
    expect(ng.totalCarryFraction.toNumber()).toBeCloseTo(
      carryFraction.toNumber(),
      10,
    );
    // Net wealth = grossWealth * (1 - carryFraction) since no mgmt fees.
    const expectedNetWealth = grossWealth.times(
      new Decimal(1).minus(carryFraction),
    );
    expect(ng.netTotal.toNumber()).toBeCloseTo(
      expectedNetWealth.minus(1).toNumber(),
      10,
    );
  });

  it("charges no carry when gross gain is below the hurdle", () => {
    const m: Manager = {
      id: "lo",
      name: "Below hurdle",
      strategy: "test",
      vintage: 2020,
      aum: 100,
      fees: { managementFee: 0, fundExpenses: 0, carry: 0.2, hurdle: 0.08 },
      grossReturns: [0.01, 0.01, 0.01, 0.01], // ~4% < 8% hurdle
      benchmarkReturns: [0, 0, 0, 0],
    };
    const ng = netGross(m, { periodsPerYear: 4 });
    expect(ng.totalCarryFraction.toNumber()).toBe(0);
    expect(ng.netReturns).toEqual(ng.grossReturns);
  });
});

describe("netGross — validation", () => {
  it("rejects an empty gross series", () => {
    const m = { ...find("cypress-credit"), grossReturns: [] };
    expect(() => netGross(m, OPTS)).toThrow(ManagerError);
  });
  it("rejects non-integer periodsPerYear", () => {
    expect(() => netGross(find("cypress-credit"), { periodsPerYear: 1.5 })).toThrow(
      ManagerError,
    );
  });
  it("rejects negative fee rates", () => {
    const m = {
      ...find("cypress-credit"),
      fees: { managementFee: -0.01, fundExpenses: 0, carry: 0, hurdle: 0 },
    };
    expect(() => netGross(m, OPTS)).toThrow(ManagerError);
  });
  it("rejects a non-finite gross return", () => {
    const m = { ...find("cypress-credit"), grossReturns: [0.01, NaN, 0.02] };
    expect(() => netGross(m, OPTS)).toThrow(ManagerError);
  });
});

describe("netGross — net never exceeds gross when fees are positive", () => {
  it.each(MANAGERS.map((m) => [m.name, m] as const))(
    "%s: net total <= gross total",
    (_name, m) => {
      const ng = netGross(m, OPTS);
      expect(ng.netTotal.lessThanOrEqualTo(ng.grossTotal)).toBe(true);
      // net series compounds to the reported net total.
      expect(compoundReturn(ng.netReturns as number[])).toBeCloseTo(
        ng.netTotal.toNumber(),
        8,
      );
    },
  );
});

describe("feeDrag", () => {
  it("equals grossTotal − netTotal and shares the gross profit", () => {
    const m = find("meridian-global-equity");
    const fd = feeDrag(m, OPTS);
    const ng = netGross(m, OPTS);
    expect(fd.drag.toNumber()).toBeCloseTo(
      ng.grossTotal.minus(ng.netTotal).toNumber(),
      12,
    );
    expect(fd.dragShareOfProfit.toNumber()).toBeCloseTo(
      fd.drag.div(ng.grossTotal).toNumber(),
      12,
    );
    expect(fd.annualFeeRate).toBeCloseTo(0.017, 12); // 1.5% + 0.2%
  });

  it("reports zero drag-share when there is no gross profit", () => {
    const m: Manager = {
      ...find("cypress-credit"),
      grossReturns: [-0.05, -0.05, -0.05, -0.05],
    };
    const fd = feeDrag(m, { periodsPerYear: 4 });
    expect(fd.grossTotal.isNegative()).toBe(true);
    expect(fd.dragShareOfProfit.toNumber()).toBe(0);
  });
});

describe("relative — net series vs benchmark", () => {
  it("Meridian beats its benchmark net of fees with a strong info ratio", () => {
    const r = relative(find("meridian-global-equity"), OPTS);
    expect(r.excessReturn).toBeGreaterThan(0);
    expect(r.excessReturn).toBeCloseTo(0.119, 2);
    expect(r.informationRatio).toBeGreaterThan(0);
    expect(r.hitRate).toBeGreaterThan(0.5);
  });

  it("Aurora trails its benchmark net of fees (negative excess)", () => {
    const r = relative(find("aurora-ventures"), OPTS);
    expect(r.excessReturn).toBeLessThan(0);
    expect(r.hitRate).toBeLessThan(0.5);
  });

  it("rejects a benchmark series that does not align", () => {
    const m = { ...find("cypress-credit"), benchmarkReturns: [0.01, 0.02] };
    expect(() => relative(m, OPTS)).toThrow(ManagerError);
  });
});

describe("compositeScore", () => {
  it("is 0–100 and monotone in its inputs", () => {
    const good = compositeScore(
      {
        netReturn: 0.3,
        benchmarkReturn: 0.1,
        excessReturn: 0.2,
        trackingError: 0.05,
        informationRatio: 2,
        beta: 1,
        hitRate: 1,
      },
      {
        grossTotal: new Decimal(0.35),
        netTotal: new Decimal(0.3),
        drag: new Decimal(0.05),
        dragShareOfProfit: new Decimal(0.05),
        annualFeeRate: 0.01,
      },
    );
    const bad = compositeScore(
      {
        netReturn: -0.1,
        benchmarkReturn: 0.1,
        excessReturn: -0.2,
        trackingError: 0.2,
        informationRatio: -1,
        beta: 2,
        hitRate: 0,
      },
      {
        grossTotal: new Decimal(0.05),
        netTotal: new Decimal(-0.1),
        drag: new Decimal(0.15),
        dragShareOfProfit: new Decimal(0.6),
        annualFeeRate: 0.03,
      },
    );
    expect(good.composite).toBeGreaterThan(80);
    expect(bad.composite).toBeLessThan(20);
    expect(good.composite).toBeGreaterThan(bad.composite);
    for (const s of [good, bad]) {
      for (const v of [s.excess, s.infoRatio, s.feeEfficiency, s.consistency, s.composite]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("rejects non-positive total weights", () => {
    const rel = relative(find("cypress-credit"), OPTS);
    const fd = feeDrag(find("cypress-credit"), OPTS);
    expect(() =>
      compositeScore(rel, fd, {
        excess: 0,
        infoRatio: 0,
        feeEfficiency: 0,
        consistency: 0,
      }),
    ).toThrow(ManagerError);
  });

  it("uses DEFAULT_SCORE_WEIGHTS that sum to 1", () => {
    const w = DEFAULT_SCORE_WEIGHTS;
    expect(w.excess + w.infoRatio + w.feeEfficiency + w.consistency).toBeCloseTo(
      1,
      12,
    );
  });
});

describe("scoreManager + scoreRoster", () => {
  it("scores Meridian best and Aurora worst of the fixture roster", () => {
    const ranked = scoreRoster(MANAGERS, OPTS);
    expect(ranked[0].id).toBe("meridian-global-equity");
    expect(ranked[ranked.length - 1].id).toBe("aurora-ventures");
    // strictly descending by composite
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score.composite).toBeGreaterThanOrEqual(
        ranked[i].score.composite,
      );
    }
  });

  it("scoreManager echoes identity fields and benchmark", () => {
    const card = scoreManager(find("halcyon-macro"), OPTS);
    expect(card.name).toBe("Halcyon Macro");
    expect(card.vintage).toBe(2017);
    expect(card.benchmarkReturns).toEqual(find("halcyon-macro").benchmarkReturns);
  });

  it("is deterministic — identical inputs give identical scores", () => {
    const a = scoreRoster(MANAGERS, OPTS).map((c) => c.score.composite);
    const b = scoreRoster(MANAGERS, OPTS).map((c) => c.score.composite);
    expect(a).toEqual(b);
  });
});
