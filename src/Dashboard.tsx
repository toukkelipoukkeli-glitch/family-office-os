import { CommandPaletteTrigger } from "@/components/CommandPaletteTrigger";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NetWorthDashboard } from "@/networth/NetWorthDashboard";
import { seededNetWorth } from "@/lib/networth";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The application's main view: the net-worth-over-time dashboard with
 * allocation drill-down, driven by the deterministic seeded portfolio fixture.
 *
 * The header navigation is generated from the typed route registry
 * ({@link ROUTES}) rather than hand-written, so adding a route automatically
 * surfaces it in the nav with the right label and `data-testid`.
 */
export function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Family Office OS
          </h1>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4">
              {ROUTES.filter((r) => r.nav !== false).map((r, i) => (
                <a
                  key={r.path}
                  href={`#${r.path}`}
                  data-testid={r.navTestId}
                  className={cn(
                    "text-sm underline-offset-4 hover:underline",
                    // The first link (Overview) is emphasised; the rest are
                    // muted, matching the original hand-written navigation.
                    i === 0
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </a>
              ))}
            </nav>
            <CommandPaletteTrigger />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <NetWorthDashboard model={seededNetWorth} />
      </main>
    </div>
  );
}

export default Dashboard;
