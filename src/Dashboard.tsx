import { NetWorthDashboard } from "@/networth/NetWorthDashboard";
import { seededNetWorth } from "@/lib/networth";

/**
 * The application's main view: the net-worth-over-time dashboard with
 * allocation drill-down, driven by the deterministic seeded portfolio fixture.
 */
export function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Family Office OS
          </h1>
          <nav className="flex items-center gap-4">
            <a
              href="#/charts"
              data-testid="nav-charts"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Charts
            </a>
            <a
              href="#/scenarios"
              data-testid="nav-scenarios"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Scenarios
            </a>
            <a
              href="#/attribution"
              data-testid="nav-attribution"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Attribution
            </a>
            <a
              href="#/cashflow"
              data-testid="nav-cashflow"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Cashflow
            </a>
            <a
              href="#/captable"
              data-testid="nav-captable"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Cap table
            </a>
            <a
              href="#/taxlots"
              data-testid="nav-taxlots"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Tax lots
            </a>
            <a
              href="#/ownership"
              data-testid="nav-ownership"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Ownership
            </a>
            <a
              href="#/pipeline"
              data-testid="nav-pipeline"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Pipeline
            </a>
            <a
              href="#/companies"
              data-testid="nav-companies"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Companies
            </a>
            <a
              href="#/lookthrough"
              data-testid="nav-lookthrough"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Look-through
            </a>
            <a
              href="#/org"
              data-testid="nav-org"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Org chart
            </a>
            <a
              href="#/relationships"
              data-testid="nav-relationships"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Relationships
            </a>
            <a
              href="#/ops"
              data-testid="nav-ops"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Ops cockpit
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <NetWorthDashboard model={seededNetWorth} />
      </main>
    </div>
  );
}

export default Dashboard;
