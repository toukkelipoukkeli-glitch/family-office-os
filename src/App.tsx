import Dashboard from "@/Dashboard";
import CapTablePage from "@/captable/CapTablePage";
import { ChartsGalleryPage } from "@/components/charts/charts-gallery";
import { useHashRoute } from "@/lib/use-hash-route";
import OpsPage from "@/ops/OpsPage";

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

  return <Dashboard />;
}

export default App;
