import { describe, expect, it } from "vitest";

import {
  buildPrivateMarketsModel,
  seededPrivateMarketsModel,
} from "./view";
import { buyoutFund, ventureFund } from "./fixtures";

describe("buildPrivateMarketsModel", () => {
  it("exposes hand-computed portfolio KPIs as plain numbers", () => {
    const { kpis, currency } = seededPrivateMarketsModel;
    expect(currency).toBe("USD");
    expect(kpis.committed).toBe(24_000_000);
    expect(kpis.paidIn).toBe(18_500_000);
    expect(kpis.distributed).toBe(19_300_000);
    expect(kpis.nav).toBe(9_700_000);
    expect(kpis.unfunded).toBe(5_500_000);
    expect(kpis.tvpi).toBeCloseTo((19_300_000 + 9_700_000) / 18_500_000, 8);
    expect(kpis.irr).not.toBeNull();
    expect(kpis.irr!).toBeGreaterThan(0);
  });

  it("sorts commitment rows by committed capital, largest first", () => {
    const rows = seededPrivateMarketsModel.commitments;
    expect(rows.map((r) => r.id)).toEqual([
      "pe-buyout-2017", // 10M
      "vc-growth-2022", // 8M
      "ra-infra-2015", // 6M
    ]);
    const committed = rows.map((r) => r.committed);
    expect(committed).toEqual([...committed].sort((a, b) => b - a));
  });

  it("produces one J-curve series per commitment, in row order", () => {
    const { commitments, jcurves } = seededPrivateMarketsModel;
    expect(jcurves.map((j) => j.id)).toEqual(commitments.map((r) => r.id));
    const buyout = jcurves.find((j) => j.id === "pe-buyout-2017")!;
    expect(buyout.trough).toBeCloseTo(-9_000_000, 6);
    expect(buyout.breakevenDate).toBe("2023-11-30");
  });

  it("marks the venture fund as never breaking even", () => {
    const vc = seededPrivateMarketsModel.jcurves.find(
      (j) => j.id === "vc-growth-2022",
    )!;
    expect(vc.breakevenDate).toBeNull();
  });

  it("accepts a custom sleeve", () => {
    const model = buildPrivateMarketsModel({
      commitments: [buyoutFund, ventureFund],
    });
    expect(model.commitments).toHaveLength(2);
    expect(model.kpis.committed).toBe(18_000_000); // 10M + 8M
  });
});
