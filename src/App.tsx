import { AlertsPage } from "@/alerts/AlertsPage";
import Dashboard from "@/Dashboard";
import { AttributionPage } from "@/attribution/AttributionPage";
import { BenchmarkPage } from "@/benchmark/BenchmarkPage";
import CapTablePage from "@/captable/CapTablePage";
import CompanyProfilePage from "@/company/CompanyProfilePage";
import { ChartsGalleryPage } from "@/components/charts/charts-gallery";
import EstatePlannerPage from "@/estate/EstatePlannerPage";
import { OwnershipGraphPage } from "@/components/ownership/ownership-graph-page";
import FeesPage from "@/fees/FeesPage";
import HarvestPage from "@/harvest/HarvestPage";
import { useHashRoute } from "@/lib/use-hash-route";
import LookThroughPage from "@/lookthrough/LookThroughPage";
import OpsPage from "@/ops/OpsPage";
import OrgChartPage from "@/org/OrgChartPage";
import PipelinePage from "@/pipeline/PipelinePage";
import { RelationshipGraphPage } from "@/relationship/RelationshipGraphPage";
import { ScenarioCockpit } from "@/scenario/ScenarioCockpitPage";
import TaxLotsPage from "@/taxlots/TaxLotsPage";

function App() {
  const path = useHashRoute();

  if (path === "/ops") {
    return <OpsPage />;
  }

  if (path === "/captable") {
    return <CapTablePage />;
  }

  if (path === "/taxlots") {
    return <TaxLotsPage />;
  }

  if (path === "/harvest") {
    return <HarvestPage />;
  }

  if (path === "/alerts") {
    return <AlertsPage />;
  }

  if (path === "/org") {
    return <OrgChartPage />;
  }

  if (path === "/charts") {
    return <ChartsGalleryPage />;
  }

  if (path === "/scenarios") {
    return <ScenarioCockpit />;
  }

  if (path === "/attribution") {
    return <AttributionPage />;
  }

  if (path === "/benchmark") {
    return <BenchmarkPage />;
  }

  if (path === "/fees") {
    return <FeesPage />;
  }

  if (path === "/ownership") {
    return <OwnershipGraphPage />;
  }

  if (path === "/lookthrough") {
    return <LookThroughPage />;
  }

  if (path === "/estate") {
    return <EstatePlannerPage />;
  }

  if (path === "/pipeline" || path.startsWith("/pipeline/")) {
    return <PipelinePage path={path} />;
  }

  if (path === "/companies") {
    return <CompanyProfilePage />;
  }

  if (path === "/relationships") {
    return <RelationshipGraphPage />;
  }

  return <Dashboard />;
}

export default App;
