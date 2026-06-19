import Dashboard from "@/Dashboard";
import { useHashRoute } from "@/lib/use-hash-route";
import OpsPage from "@/ops/OpsPage";

function App() {
  const path = useHashRoute();

  if (path === "/ops") {
    return <OpsPage />;
  }

  return <Dashboard />;
}

export default App;
