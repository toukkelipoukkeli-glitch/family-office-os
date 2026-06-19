import { describe, expect, it } from "vitest";

import {
  CompanyProfile,
  financialsChronological,
  holdingWeights,
  latestFinancialYear,
  netDebt,
  totalHoldingsValue,
} from "./company-profile";
import {
  realEstateProfile,
  sampleProfileFor,
  sampleProfiles,
  topcoProfile,
  venturesProfile,
} from "./profile-fixtures";

describe("CompanyProfile schema", () => {
  it("parses every sample profile", () => {
    for (const p of sampleProfiles) {
      expect(() => CompanyProfile.parse(p)).not.toThrow();
    }
  });

  it("rejects duplicate fiscal years", () => {
    const bad = {
      companyId: "c1",
      reportingCurrency: "EUR",
      financials: [
        {
          fiscalYear: 2024,
          revenue: { amount: "1", currency: "EUR" },
          ebitda: { amount: "1", currency: "EUR" },
          netIncome: { amount: "1", currency: "EUR" },
          totalAssets: { amount: "1", currency: "EUR" },
          totalEquity: { amount: "1", currency: "EUR" },
          cash: { amount: "1", currency: "EUR" },
          debt: { amount: "1", currency: "EUR" },
        },
        {
          fiscalYear: 2024,
          revenue: { amount: "1", currency: "EUR" },
          ebitda: { amount: "1", currency: "EUR" },
          netIncome: { amount: "1", currency: "EUR" },
          totalAssets: { amount: "1", currency: "EUR" },
          totalEquity: { amount: "1", currency: "EUR" },
          cash: { amount: "1", currency: "EUR" },
          debt: { amount: "1", currency: "EUR" },
        },
      ],
    };
    const res = CompanyProfile.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("rejects duplicate holding ids", () => {
    const res = CompanyProfile.safeParse({
      companyId: "c1",
      reportingCurrency: "EUR",
      holdings: [
        { id: "h", name: "A", kind: "cash", value: { amount: "1", currency: "EUR" } },
        { id: "h", name: "B", kind: "cash", value: { amount: "2", currency: "EUR" } },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects the same person listed twice", () => {
    const res = CompanyProfile.safeParse({
      companyId: "c1",
      reportingCurrency: "EUR",
      people: [
        { personId: "p1", role: "director" },
        { personId: "p1", role: "officer" },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a negative revenue (non-negative money)", () => {
    const res = CompanyProfile.safeParse({
      companyId: "c1",
      reportingCurrency: "EUR",
      financials: [
        {
          fiscalYear: 2024,
          revenue: { amount: "-1", currency: "EUR" },
          ebitda: { amount: "1", currency: "EUR" },
          netIncome: { amount: "1", currency: "EUR" },
          totalAssets: { amount: "1", currency: "EUR" },
          totalEquity: { amount: "1", currency: "EUR" },
          cash: { amount: "1", currency: "EUR" },
          debt: { amount: "1", currency: "EUR" },
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("allows a negative net income and equity", () => {
    expect(() => CompanyProfile.parse(venturesProfile)).not.toThrow();
    const fy2023 = venturesProfile.financials.find((f) => f.fiscalYear === 2023);
    expect(Number(fy2023?.netIncome.amount)).toBeLessThan(0);
  });
});

describe("latestFinancialYear", () => {
  it("returns the most recent year regardless of input order", () => {
    expect(latestFinancialYear(topcoProfile)?.fiscalYear).toBe(2024);
  });

  it("returns undefined for an empty profile", () => {
    const empty = CompanyProfile.parse({
      companyId: "c0",
      reportingCurrency: "EUR",
    });
    expect(latestFinancialYear(empty)).toBeUndefined();
  });
});

describe("financialsChronological", () => {
  it("sorts ascending and does not mutate the source", () => {
    const sorted = financialsChronological(topcoProfile);
    expect(sorted.map((f) => f.fiscalYear)).toEqual([2022, 2023, 2024]);
    // Source order preserved.
    expect(topcoProfile.financials[0].fiscalYear).toBe(2022);
  });
});

describe("totalHoldingsValue", () => {
  it("sums holding values exactly in the reporting currency", () => {
    const total = totalHoldingsValue(topcoProfile);
    // 22,000,000 + 14,500,000 + 8,600,000 + 4,200,000 + 3,100,000
    expect(total.toString()).toBe("52400000 EUR");
  });

  it("is zero for a profile with no holdings", () => {
    const empty = CompanyProfile.parse({
      companyId: "c0",
      reportingCurrency: "USD",
    });
    expect(totalHoldingsValue(empty).isZero()).toBe(true);
    expect(totalHoldingsValue(empty).currency).toBe("USD");
  });
});

describe("holdingWeights", () => {
  it("produces weights that sum to ~100", () => {
    const weights = holdingWeights(topcoProfile);
    const sum = weights.reduce((a, w) => a + w.weight, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("orders the largest holding first by value share", () => {
    const weights = holdingWeights(realEstateProfile);
    const helsinki = weights.find((w) => w.id === "re-helsinki");
    const cash = weights.find((w) => w.id === "re-cash");
    expect(helsinki!.weight).toBeGreaterThan(cash!.weight);
  });

  it("returns zero weights when the total is zero", () => {
    const zeroed = CompanyProfile.parse({
      companyId: "c0",
      reportingCurrency: "EUR",
      holdings: [
        { id: "a", name: "A", kind: "cash", value: { amount: "0", currency: "EUR" } },
      ],
    });
    expect(holdingWeights(zeroed)).toEqual([
      { id: "a", name: "A", kind: "cash", weight: 0 },
    ]);
  });
});

describe("netDebt", () => {
  it("is positive when debt exceeds cash", () => {
    const fy = topcoProfile.financials.find((f) => f.fiscalYear === 2024)!;
    // 10,800,000 debt - 9,300,000 cash = 1,500,000
    expect(netDebt(fy).toString()).toBe("1500000 EUR");
  });

  it("is negative for a net-cash company", () => {
    const fy = venturesProfile.financials.find((f) => f.fiscalYear === 2023)!;
    // 0 debt - 2,600,000 cash
    expect(netDebt(fy).isNegative()).toBe(true);
  });
});

describe("sampleProfileFor", () => {
  it("looks up a profile by company id", () => {
    expect(sampleProfileFor("co-topco")).toBe(topcoProfile);
    expect(sampleProfileFor("co-realestate")).toBe(realEstateProfile);
    expect(sampleProfileFor("does-not-exist")).toBeUndefined();
  });
});
