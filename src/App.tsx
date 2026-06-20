import Dashboard from "@/Dashboard";
import { AttributionPage } from "@/attribution/AttributionPage";
import CapTablePage from "@/captable/CapTablePage";
import CompanyProfilePage from "@/company/CompanyProfilePage";
import { ChartsGalleryPage } from "@/components/charts/charts-gallery";
import { OwnershipGraphPage } from "@/components/ownership/ownership-graph-page";
import { useHashRoute } from "@/lib/use-hash-route";
import OpsPage from "@/ops/OpsPage";
import OrgChartPage from "@/org/OrgChartPage";
import PipelinePage from "@/pipeline/PipelinePage";
import { RelationshipGraphPage } from "@/relationship/RelationshipGraphPage";
import { ScenarioCockpit } from "@/scenario/ScenarioCockpitPage";

function App() {
  const path = useHashRoute();

  if (path === "/ops") {
    return <OpsPage />;
  }

  if (path === "/captable") {
    return <CapTablePage />;
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

  if (path === "/ownership") {
    return <OwnershipGraphPage />;
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
