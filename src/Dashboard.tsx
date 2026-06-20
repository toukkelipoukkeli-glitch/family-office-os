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
              href="#/reports"
              data-testid="nav-reports"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Reports
            </a>
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
              href="#/stress"
              data-testid="nav-stress"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Stress tests
            </a>
            <a
              href="#/attribution"
              data-testid="nav-attribution"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Attribution
            </a>
            <a
              href="#/benchmark"
              data-testid="nav-benchmark"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Benchmark
            </a>
            <a
              href="#/alerts"
              data-testid="nav-alerts"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Alerts
            </a>
            <a
              href="#/ips"
              data-testid="nav-ips"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              IPS
            </a>
            <a
              href="#/fees"
              data-testid="nav-fees"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Fees
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
              href="#/harvest"
              data-testid="nav-harvest"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Harvest
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
              href="#/risk"
              data-testid="nav-risk"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Risk
            </a>
            <a
              href="#/privatemarkets"
              data-testid="nav-privatemarkets"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Private markets
            </a>
            <a
              href="#/cashflow"
              data-testid="nav-cashflow"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Cashflow
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
              href="#/estate"
              data-testid="nav-estate"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Estate
            </a>
            <a
              href="#/vault"
              data-testid="nav-vault"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Vault
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
