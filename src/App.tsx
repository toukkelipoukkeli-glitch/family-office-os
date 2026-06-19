import Dashboard from "@/Dashboard";
import CapTablePage from "@/captable/CapTablePage";
import { ChartsGalleryPage } from "@/components/charts/charts-gallery";
import { OwnershipGraphPage } from "@/components/ownership/ownership-graph-page";
import { useHashRoute } from "@/lib/use-hash-route";
import OpsPage from "@/ops/OpsPage";
import PipelinePage from "@/pipeline/PipelinePage";

function App() {
  const path = useHashRoute();

  if (path === "/ops") {
    return <OpsPage />;
  }

  if (path === "/captable") {
    return <CapTablePage />;
  }

  if (path === "/charts") {
    return <ChartsGalleryPage />;
  }

  if (path === "/ownership") {
    return <OwnershipGraphPage />;
  }

  if (path === "/pipeline" || path.startsWith("/pipeline/")) {
    return <PipelinePage path={path} />;
  }

  return <Dashboard />;
}

export default App;
