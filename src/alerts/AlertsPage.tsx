import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  alertsPortfolio,
  alertsRateTable,
  defaultAlertRules,
  evaluateAlerts,
} from "@/lib/alerts";
import { cn } from "@/lib/utils";

import { buildAlertsViewModel, type AlertRow } from "./alerts-view";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

/** A filter the user can toggle: show all rules, or just the breaches. */
type Filter = "breaches" | "all";

export function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("breaches");

  const vm = useMemo(() => {
    const report = evaluateAlerts(
      alertsPortfolio,
      defaultAlertRules,
      alertsRateTable,
    );
    return buildAlertsViewModel(report);
  }, []);

  const visibleRows = filter === "breaches" ? vm.breaches : vm.rows;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Limit alerts
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "limit-alerts",
                [
                  "id",
                  "ruleLabel",
                  "subject",
                  "scopeLabel",
                  "severityLabel",
                  "breached",
                  "weightLabel",
                  "limitLabel",
                  "valueLabel",
                  "breachDetail",
                ],
                vm.rows.map((r) => [
                  r.id,
                  r.ruleLabel,
                  r.subject,
                  r.scopeLabel,
                  r.severityLabel,
                  r.breached,
                  r.weightLabel,
                  r.limitLabel,
                  r.valueLabel,
                  r.breachDetail ?? null,
                ]),
                vm,
              )}
              testId="alerts-export"
            />
            <a
              href="#/"
              data-testid="alerts-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="alerts-page"
      >
        <section className="grid gap-4 sm:grid-cols-3" data-testid="alerts-summary">
          <SummaryCard
            testid="summary-critical"
            icon={<ShieldAlert className="size-5" aria-hidden="true" />}
            tone={vm.criticalCount > 0 ? "critical" : "neutral"}
            value={vm.criticalCount}
            label="Critical breaches"
          />
          <SummaryCard
            testid="summary-warning"
            icon={<AlertTriangle className="size-5" aria-hidden="true" />}
            tone={vm.warningCount > 0 ? "warning" : "neutral"}
            value={vm.warningCount}
            label="Warnings"
          />
          <SummaryCard
            testid="summary-total"
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            tone="neutral"
            value={vm.totalLabel}
            label="Book monitored"
            isText
          />
        </section>

        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-base">
                Concentration &amp; limit breaches
              </CardTitle>
              <CardDescription>
                Per asset-class, position and currency thresholds checked against
                the {vm.baseCurrency} book.
              </CardDescription>
            </div>
            <div
              className="inline-flex shrink-0 rounded-md border border-border p-0.5"
              role="group"
              aria-label="Filter alerts"
            >
              <FilterButton
                testid="filter-breaches"
                active={filter === "breaches"}
                onClick={() => setFilter("breaches")}
              >
                Breaches ({vm.totalBreaches})
              </FilterButton>
              <FilterButton
                testid="filter-all"
                active={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All rules ({vm.rows.length})
              </FilterButton>
            </div>
          </CardHeader>
          <CardContent>
            {filter === "breaches" && vm.allClear ? (
              <div
                data-testid="all-clear"
                className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center"
              >
                <CheckCircle2
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">No limit breaches</p>
                <p className="text-sm text-muted-foreground">
                  Every concentration and limit rule is within tolerance.
                </p>
              </div>
            ) : (
              <ul className="space-y-3" data-testid="alerts-list">
                {visibleRows.map((row) => (
                  <AlertRowItem key={row.id} row={row} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone,
  testid,
  isText = false,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  tone: "critical" | "warning" | "neutral";
  testid: string;
  isText?: boolean;
}) {
  return (
    <Card data-testid={testid}>
      <CardContent className="flex items-center gap-3 p-5">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            tone === "critical" && "bg-destructive/10 text-destructive",
            tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-500",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div
            data-testid={`${testid}-value`}
            className={cn(
              "font-semibold tabular-nums",
              isText ? "text-lg" : "text-2xl",
            )}
          >
            {value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterButton({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AlertRowItem({ row }: { row: AlertRow }) {
  const tone = row.breached
    ? row.severity === "critical"
      ? "critical"
      : "warning"
    : "ok";

  return (
    <li
      data-testid="alert-row"
      data-breached={row.breached}
      data-severity={row.severity}
      className={cn(
        "rounded-lg border p-4",
        tone === "critical" && "border-destructive/40 bg-destructive/5",
        tone === "warning" && "border-amber-500/40 bg-amber-500/5",
        tone === "ok" && "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium" data-testid="alert-subject">
              {row.subject}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {row.scopeLabel}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {row.ruleLabel} · {row.limitLabel}
          </div>
        </div>
        <div className="text-right">
          <div
            data-testid="alert-weight"
            className={cn(
              "text-lg font-semibold tabular-nums",
              tone === "critical" && "text-destructive",
              tone === "warning" && "text-amber-600 dark:text-amber-500",
            )}
          >
            {row.weightLabel}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {row.valueLabel}
          </div>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          data-testid="alert-bar"
          className={cn(
            "h-full rounded-full",
            tone === "critical" && "bg-destructive",
            tone === "warning" && "bg-amber-500",
            tone === "ok" && "bg-primary/60",
          )}
          style={{ width: `${(row.fill * 100).toFixed(1)}%` }}
        />
      </div>

      {row.breachDetail && (
        <p
          data-testid="alert-detail"
          className={cn(
            "mt-2 text-sm font-medium",
            tone === "critical" ? "text-destructive" : "text-amber-600 dark:text-amber-500",
          )}
        >
          {row.breachDetail}
        </p>
      )}
    </li>
  );
}

export default AlertsPage;
