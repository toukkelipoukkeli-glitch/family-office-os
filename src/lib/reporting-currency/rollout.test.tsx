import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsolidationView } from "@/consolidation/ConsolidationPage";
import { RiskCockpitView } from "@/risk/RiskCockpitView";
import { ConcentrationView } from "@/concentration/ConcentrationView";
import { LookThroughView } from "@/lookthrough/LookThroughPage";
import { CashflowPage } from "@/cashflow/CashflowPage";
import { EstatePlannerPage } from "@/estate/EstatePlannerPage";
import { GivingPage } from "@/giving/GivingPage";
import { GoalFundingPage } from "@/goals/GoalFundingPage";
import { InsurancePage } from "@/insurance/InsurancePage";
import { TaxTimelinePage } from "@/taxtimeline/TaxTimelinePage";
import { ManagerScorecardPage } from "@/managers/ManagerScorecardPage";

import { ReportingCurrencyProvider } from "./reporting-provider";

/**
 * m13-currency-rollout — the rollout oracle.
 *
 * Each value-bearing page that was wired through the reporting-currency
 * boundary is rendered twice: once in the canonical base (USD) and once in a
 * non-base reporting currency (EUR). Because EUR is worth MORE than one USD in
 * the seeded FX table (1 EUR = $1.08), the SAME base-USD figure re-expresses to
 * FEWER reporting units — so a page's headline money figure must visibly change
 * when the reporting currency changes, and the USD `$` symbol must disappear
 * from that figure.
 *
 * Two formatter styles coexist in the app and both are exercised here:
 *  - `@/lib/format` (Intl): renders the proper symbol, e.g. `€840K`.
 *  - the per-page `./format` helpers: render a code prefix, e.g. `EUR 2.5M`.
 * In either style a EUR figure contains `EUR`/`€` and never the dollar sign.
 *
 * The default-USD render is also asserted to be byte-identical to rendering
 * with no provider at all (the no-op base path), proving the rollout never
 * alters the canonical USD view.
 */

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/** Render `node` under a provider fixed to `currency`. */
function renderIn(currency: string, node: React.ReactElement) {
  return render(
    <ReportingCurrencyProvider initialCurrency={currency}>
      {node}
    </ReportingCurrencyProvider>,
  );
}

/** The text of the (single) money figure identified by `testId`. */
function moneyAt(testId: string): string {
  return screen.getByTestId(testId).textContent ?? "";
}

/** True when a figure is expressed in EUR (either `€840K` or `EUR 2.5M`). */
function isEur(text: string): boolean {
  return /€|EUR/.test(text) && !text.includes("$");
}

describe("currency rollout — every wired page re-expresses its headline figure", () => {
  // Each probe is a test-id wrapping exactly ONE money figure, so the symbol /
  // value assertions are not polluted by unrelated currency-free text.
  const cases: { name: string; node: React.ReactElement; probe: string }[] = [
    {
      name: "consolidation",
      node: <ConsolidationView />,
      probe: "cons-kpi-consolidated-value",
    },
    { name: "risk", node: <RiskCockpitView />, probe: "risk-stat-networth" },
    {
      name: "concentration",
      node: <ConcentrationView />,
      probe: "conc-stat-networth",
    },
    {
      name: "look-through",
      node: <LookThroughView />,
      probe: "lt-stat-value",
    },
    { name: "cashflow", node: <CashflowPage />, probe: "kpi-opening" },
    { name: "estate", node: <EstatePlannerPage />, probe: "kpi-gross" },
    { name: "giving", node: <GivingPage />, probe: "kpi-gifted" },
    { name: "goals", node: <GoalFundingPage />, probe: "kpi-target" },
    { name: "insurance", node: <InsurancePage />, probe: "kpi-coverage" },
    { name: "tax-timeline", node: <TaxTimelinePage />, probe: "kpi-tax" },
    { name: "managers", node: <ManagerScorecardPage />, probe: "manager-aum" },
  ];

  it.each(cases)(
    "$name: USD figure shows $, EUR figure re-expresses to a different value",
    ({ node, probe }) => {
      const { unmount } = renderIn("USD", node);
      const usd = moneyAt(probe);
      expect(usd).toContain("$");
      unmount();

      renderIn("EUR", node);
      const eur = moneyAt(probe);
      expect(isEur(eur)).toBe(true);
      // A real conversion, not a cosmetic symbol swap.
      expect(eur).not.toBe(usd);
    },
  );
});

describe("currency rollout — default render is the USD no-op", () => {
  it("rendering consolidation with no provider equals rendering it in USD", () => {
    const noProvider = render(<ConsolidationView />).container.textContent;
    const inUsd = renderIn("USD", <ConsolidationView />).container.textContent;
    expect(inUsd).toBe(noProvider);
  });

  it("rendering cashflow with no provider equals rendering it in USD", () => {
    const noProvider = render(<CashflowPage />).container.textContent;
    const inUsd = renderIn("USD", <CashflowPage />).container.textContent;
    expect(inUsd).toBe(noProvider);
  });
});

describe("currency rollout — conversion direction is correct", () => {
  /** Numeric magnitude of a compact figure like `$41.0M` / `€38.0M`. */
  const magnitude = (s: string): number =>
    Number.parseFloat(s.replace(/[^0-9.]/g, ""));

  it("a base-USD figure becomes a SMALLER number of EUR (EUR worth more)", () => {
    // The consolidated net-worth KPI is a single base-USD total. € is worth
    // more than $, so the same value is FEWER euros — its compact magnitude
    // must shrink while staying in the same B/M suffix tier.
    const usd = renderIn("USD", <ConsolidationView />);
    const usdValue = within(usd.container).getByTestId(
      "cons-kpi-consolidated-value",
    ).textContent!;
    usd.unmount();

    const eur = renderIn("EUR", <ConsolidationView />);
    const eurValue = within(eur.container).getByTestId(
      "cons-kpi-consolidated-value",
    ).textContent!;

    expect(usdValue).toContain("$");
    expect(isEur(eurValue)).toBe(true);
    expect(magnitude(eurValue)).toBeLessThan(magnitude(usdValue));
  });
});
