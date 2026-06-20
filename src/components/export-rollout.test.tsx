import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";

import AttributionPage from "@/attribution/AttributionPage";
import BenchmarkPage from "@/benchmark/BenchmarkPage";
import CapTablePage from "@/captable/CapTablePage";
import CashflowPage from "@/cashflow/CashflowPage";
import ConcentrationPage from "@/concentration/ConcentrationPage";
import CurrencyPage from "@/currency/CurrencyPage";
import DataQualityPage from "@/dataquality/DataQualityPage";
import FactorAttributionPage from "@/factors/FactorAttributionPage";
import FeesPage from "@/fees/FeesPage";
import HarvestPage from "@/harvest/HarvestPage";
import EstatePlannerPage from "@/estate/EstatePlannerPage";
import GivingPage from "@/giving/GivingPage";
import GoalFundingPage from "@/goals/GoalFundingPage";
import LookThroughPage from "@/lookthrough/LookThroughPage";
import IpsPage from "@/ips/IpsPage";
import OrgChartPage from "@/org/OrgChartPage";
import ConsolidationPage from "@/consolidation/ConsolidationPage";
import PrivateMarketsPage from "@/privatemarkets/PrivateMarketsPage";
import StressTestPage from "@/stress/StressTestPage";
import RebalancePage from "@/rebalance/RebalancePage";
import AlertsPage from "@/alerts/AlertsPage";
import LiquidityPage from "@/liquidity/LiquidityPage";
import ScenarioCockpitPage from "@/scenario/ScenarioCockpitPage";
import InsurancePage from "@/insurance/InsurancePage";
import VaultPage from "@/vault/VaultPage";
import PipelinePage from "@/pipeline/PipelinePage";
import CompanyProfilePage from "@/company/CompanyProfilePage";
import RelationshipGraphPage from "@/relationship/RelationshipGraphPage";
import RiskCockpitPage from "@/risk/RiskCockpitPage";
import OpsPage from "@/ops/OpsPage";

/**
 * Rollout oracle: every data-heavy page newly covered by the export rollout
 * must render an Export control with both a CSV and a JSON button. The toolkit
 * itself (serialization, the download click) is unit-tested in
 * `src/lib/export/*` and `ExportMenu.test.tsx`; this proves the control is
 * actually wired onto each page so the feature works where it must.
 *
 * Each page renders from deterministic offline fixtures (its prop defaults), so
 * the suite stays deterministic and offline.
 */
const PAGES: ReadonlyArray<[string, ComponentType, string]> = [
  ["attribution", AttributionPage, "attribution-export"],
  ["benchmark", BenchmarkPage, "benchmark-export"],
  ["captable", CapTablePage, "captable-export"],
  ["cashflow", CashflowPage, "cashflow-export"],
  ["concentration", ConcentrationPage, "concentration-export"],
  ["currency", CurrencyPage, "currency-export"],
  ["dataquality", DataQualityPage, "dataquality-export"],
  ["factors", FactorAttributionPage, "factors-export"],
  ["fees", FeesPage, "fees-export"],
  ["harvest", HarvestPage, "harvest-export"],
  ["estate", EstatePlannerPage, "estate-export"],
  ["giving", GivingPage, "giving-export"],
  ["goals", GoalFundingPage, "goals-export"],
  ["lookthrough", LookThroughPage, "lookthrough-export"],
  ["ips", IpsPage, "ips-export"],
  ["org", OrgChartPage, "org-export"],
  ["consolidation", ConsolidationPage, "consolidation-export"],
  ["privatemarkets", PrivateMarketsPage, "privatemarkets-export"],
  ["stress", StressTestPage, "stress-export"],
  ["rebalance", RebalancePage, "rebalance-export"],
  ["alerts", AlertsPage, "alerts-export"],
  ["liquidity", LiquidityPage, "liquidity-export"],
  ["scenario", ScenarioCockpitPage, "scenario-export"],
  ["insurance", InsurancePage, "insurance-export"],
  ["vault", VaultPage, "vault-export"],
  ["pipeline", PipelinePage, "pipeline-export"],
  ["company", CompanyProfilePage, "company-export"],
  ["relationship", RelationshipGraphPage, "relationships-export"],
  ["risk", RiskCockpitPage, "risk-export"],
  ["ops", OpsPage, "ops-export"],
];

describe("export rollout", () => {
  it.each(PAGES)(
    "%s page renders an Export control with CSV + JSON",
    (_name, Page, testId) => {
      render(<Page />);
      const group = screen.getByTestId(testId);
      expect(group).toHaveAttribute("aria-label", "Export data");
      expect(within(group).getByTestId(`${testId}-csv`)).toHaveTextContent(
        "CSV",
      );
      expect(within(group).getByTestId(`${testId}-json`)).toHaveTextContent(
        "JSON",
      );
    },
  );
});
