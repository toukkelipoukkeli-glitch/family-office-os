import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { Money } from "@/lib/money";
import type { CashflowModel } from "@/lib/cashflow";
import { seededNetWorth, type NetWorthDashboardModel } from "@/lib/networth";

import {
  buildOverview,
  formatMoneyCompact,
  liquidityRunwayMonths,
  seededOverview,
} from "./overview";

/** The seeded net-worth model with a forced-negative window TWR. */
function injectedNegativeNetWorth(): NetWorthDashboardModel {
  return { ...seededNetWorth, totalReturn: new Decimal("-0.0812") };
}

/** A minimal cashflow model for runway edge-case tests. */
function cashflowModel(
  kpis: Partial<CashflowModel["kpis"]>,
  monthCount: number,
): CashflowModel {
  return {
    currency: "USD",
    kpis: {
      openingBalance: 0,
      endingBalance: 0,
      minBalance: 0,
      minBalancePeriod: "2025-01",
      totalInflows: 0,
      totalOutflows: 0,
      netFlow: 0,
      firstShortfallPeriod: null,
      ...kpis,
    },
    months: Array.from({ length: monthCount }, (_, i) => ({
      index: i,
      period: `2025-${String(i + 1).padStart(2, "0")}`,
      openingBalance: 0,
      inflows: 0,
      outflows: 0,
      netFlow: 0,
      closingBalance: 0,
    })),
    categories: [],
  };
}

describe("formatMoneyCompact", () => {
  it("formats without floating-point drift", () => {
    expect(formatMoneyCompact(Money.of("7220663", "USD"))).toBe("$7.22M");
    expect(formatMoneyCompact(Money.of("480000", "USD"))).toBe("$480K");
    expect(formatMoneyCompact(Money.of("1380000", "USD"))).toBe("$1.38M");
  });

  it("handles the tier boundaries, zero and billions", () => {
    expect(formatMoneyCompact(Money.of("0", "USD"))).toBe("$0");
    expect(formatMoneyCompact(Money.of("999", "USD"))).toBe("$999");
    expect(formatMoneyCompact(Money.of("1000", "USD"))).toBe("$1K");
    expect(formatMoneyCompact(Money.of("12340000000", "USD"))).toBe("$12.34B");
  });

  it("keeps the sign for negative amounts (drawn-down positions)", () => {
    expect(formatMoneyCompact(Money.of("-7220663", "USD"))).toBe("$-7.22M");
    expect(formatMoneyCompact(Money.of("-480000", "USD"))).toBe("$-480K");
    expect(formatMoneyCompact(Money.of("-999", "USD"))).toBe("$-999");
  });

  it("renders a non-USD currency as a prefixed code", () => {
    expect(formatMoneyCompact(Money.of("1500000", "EUR"))).toBe("EUR 1.5M");
  });
});

describe("liquidityRunwayMonths", () => {
  it("divides opening cash by the average monthly burn (floored)", () => {
    // 4,000,000 opening, 1,200,000 net burn over 24 months => 50,000/mo burn
    // => 4,000,000 / 50,000 = 80 months.
    const m = cashflowModel(
      { openingBalance: 4_000_000, netFlow: -1_200_000 },
      24,
    );
    expect(liquidityRunwayMonths(m)).toBe(80);
  });

  it("is unbounded (null) when net cash-positive", () => {
    const m = cashflowModel({ openingBalance: 1_000_000, netFlow: 500_000 }, 12);
    expect(liquidityRunwayMonths(m)).toBeNull();
  });

  it("is zero when opening cash is non-positive while burning", () => {
    const m = cashflowModel({ openingBalance: 0, netFlow: -120_000 }, 12);
    expect(liquidityRunwayMonths(m)).toBe(0);
  });

  it("is null for an empty horizon", () => {
    const m = cashflowModel({ openingBalance: 100, netFlow: -100 }, 0);
    expect(liquidityRunwayMonths(m)).toBeNull();
  });
});

describe("buildOverview (seeded)", () => {
  const model = seededOverview;

  it("reports the base currency and six headline KPIs in order", () => {
    expect(model.baseCurrency).toBe("USD");
    expect(model.kpis.map((k) => k.id)).toEqual([
      "net-worth",
      "twr",
      "volatility",
      "ips",
      "liquidity",
      "alerts",
    ]);
  });

  it("surfaces the real seeded net worth and a positive window TWR", () => {
    const nw = model.kpis.find((k) => k.id === "net-worth")!;
    expect(nw.value).toBe("$7.22M");
    expect(nw.status).toBe("ok");

    const twr = model.kpis.find((k) => k.id === "twr")!;
    // Seeded 24-month TWR is +16.27%.
    expect(twr.value).toBe("+16.27%");
    expect(twr.status).toBe("ok");
    expect(twr.href).toBe("#/benchmark");
  });

  it("flags the IPS mandate as breached (critical) from the engine", () => {
    const ips = model.kpis.find((k) => k.id === "ips")!;
    // Seeded IPS report: 3 breaches, 1 critical.
    expect(ips.value).toBe("3 breaches");
    expect(ips.detail).toContain("1 critical");
    expect(ips.status).toBe("critical");
    expect(ips.href).toBe("#/ips");
  });

  it("surfaces open alerts with severity from the alert engine", () => {
    const alerts = model.kpis.find((k) => k.id === "alerts")!;
    expect(alerts.value).toBe("3 open");
    expect(alerts.status).toBe("critical");
    expect(alerts.href).toBe("#/alerts");
  });

  it("reports annualized volatility and the risk-limit breach status in one tile", () => {
    const vol = model.kpis.find((k) => k.id === "volatility")!;
    expect(vol.value).toBe("6.79% ann.");
    // Seeded risk cockpit breaches 4 limits (1 critical) -> the tile is
    // critical and surfaces the breach count alongside the drawdown.
    expect(vol.status).toBe("critical");
    expect(vol.detail).toContain("4 limit breaches");
    expect(vol.detail).toContain("max drawdown 5.25%");
    expect(vol.href).toBe("#/risk");
  });

  it("reports the liquidity runway with the min-balance month", () => {
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    // Seeded household never goes into shortfall: opening 4M, burn 2.62M/24mo.
    expect(liq.value).toMatch(/mo$/);
    expect(liq.detail).toContain("min balance $480K");
    expect(liq.detail).toContain("2025-12");
    expect(liq.href).toBe("#/cashflow");
  });

  it("aggregates open breaches across IPS + alerts + risk", () => {
    // 3 (ips) + 3 (alerts) + 4 (risk) = 10.
    expect(model.openBreaches).toBe(10);
  });

  it("rolls the worst KPI status up to the page banner (critical)", () => {
    expect(model.worstStatus).toBe("critical");
  });

  it("links every tile into a hash route", () => {
    for (const kpi of model.kpis) {
      expect(kpi.href.startsWith("#/")).toBe(true);
    }
  });
});

describe("buildOverview (injected reports)", () => {
  it("marks TWR as a warning when the injected window return is negative", () => {
    const model = buildOverview({ netWorth: injectedNegativeNetWorth() });
    const twr = model.kpis.find((k) => k.id === "twr")!;
    expect(twr.status).toBe("warning");
    expect(twr.value.startsWith("-")).toBe(true);
  });

  it("reports a cash-positive runway as unbounded with an ok status", () => {
    const model = buildOverview({
      cashflow: cashflowModel({ openingBalance: 1_000_000, netFlow: 250_000 }, 12),
    });
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    expect(liq.value).toBe("Cash-positive");
    expect(liq.status).toBe("ok");
  });

  it("flags a projected shortfall as a critical runway", () => {
    const model = buildOverview({
      cashflow: cashflowModel(
        { openingBalance: 100, netFlow: -500_000, firstShortfallPeriod: "2025-06" },
        12,
      ),
    });
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    expect(liq.value).toBe("shortfall 2025-06");
    expect(liq.status).toBe("critical");
  });

  it("warns when a finite runway falls under twelve months", () => {
    // 1,000,000 opening, 1,200,000 net burn over 12 months => 100,000/mo
    // => 10 months runway, which is < 12 and no shortfall => warning.
    const model = buildOverview({
      cashflow: cashflowModel(
        { openingBalance: 1_000_000, netFlow: -1_200_000 },
        12,
      ),
    });
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    expect(liq.value).toBe("10 mo");
    expect(liq.status).toBe("warning");
  });

  it("treats a runway of exactly twelve months as ok (boundary)", () => {
    // 1,200,000 opening, 1,200,000 burn over 12 months => 100,000/mo => 12 mo.
    const model = buildOverview({
      cashflow: cashflowModel(
        { openingBalance: 1_200_000, netFlow: -1_200_000 },
        12,
      ),
    });
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    expect(liq.value).toBe("12 mo");
    expect(liq.status).toBe("ok");
  });

  it("keeps the worst-of banner at critical even when later KPIs are ok", () => {
    // The seeded reports already carry critical IPS + alerts; a healthy
    // cashflow override must not soften the page-level worst status.
    const model = buildOverview({
      cashflow: cashflowModel({ openingBalance: 5_000_000, netFlow: 250_000 }, 12),
    });
    const liq = model.kpis.find((k) => k.id === "liquidity")!;
    expect(liq.status).toBe("ok");
    expect(model.worstStatus).toBe("critical");
  });
});
