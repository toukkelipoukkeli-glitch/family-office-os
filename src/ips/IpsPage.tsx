import { AlertTriangle, CheckCircle2, ScrollText, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { evaluatePolicy, ipsPortfolio, ipsRateTable, sampleIps } from "@/lib/ips";
import { cn } from "@/lib/utils";

import { buildIpsViewModel, type IpsRow } from "./ips-view";

/** A filter the user can toggle: show all checks, or just the breaches. */
type Filter = "breaches" | "all";

export function IpsPage() {
  const [filter, setFilter] = useState<Filter>("breaches");

  const vm = useMemo(() => {
    const report = evaluatePolicy(ipsPortfolio, sampleIps, ipsRateTable);
    return buildIpsViewModel(report);
  }, []);

  const visibleRows = filter === "breaches" ? vm.breaches : vm.rows;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            IPS compliance
          </h1>
          <a
            href="#/"
            data-testid="ips-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main
        className="mx-auto max-w-5xl space-y-6 px-6 py-10"
        data-testid="ips-page"
      >
        <section className="grid gap-4 sm:grid-cols-3" data-testid="ips-summary">
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
            testid="summary-status"
            icon={
              vm.compliant ? (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              ) : (
                <ScrollText className="size-5" aria-hidden="true" />
              )
            }
            tone={vm.compliant ? "ok" : "neutral"}
            value={vm.compliant ? "Compliant" : "In breach"}
            label="Mandate status"
            isText
          />
        </section>

        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-base" data-testid="ips-policy-name">
                {vm.policyName}
              </CardTitle>
              <CardDescription>
                Mandate constraints checked against the {vm.totalLabel}{" "}
                {vm.baseCurrency} book
                {vm.benchmarkLabel ? (
                  <>
                    {" "}
                    · benchmark{" "}
                    <span data-testid="ips-benchmark" className="font-medium">
                      {vm.benchmarkLabel}
                    </span>
                  </>
                ) : null}
                .
              </CardDescription>
            </div>
            <div
              className="inline-flex shrink-0 rounded-md border border-border p-0.5"
              role="group"
              aria-label="Filter constraint checks"
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
                All checks ({vm.rows.length})
              </FilterButton>
            </div>
          </CardHeader>
          <CardContent>
            {filter === "breaches" && vm.compliant ? (
              <div
                data-testid="all-clear"
                className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center"
              >
                <CheckCircle2
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Mandate compliant</p>
                <p className="text-sm text-muted-foreground">
                  Every IPS constraint is within tolerance.
                </p>
              </div>
            ) : (
              <ul className="space-y-3" data-testid="ips-list">
                {visibleRows.map((row) => (
                  <IpsRowItem key={row.id} row={row} />
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
  tone: "critical" | "warning" | "ok" | "neutral";
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
            tone === "warning" &&
              "bg-amber-500/10 text-amber-600 dark:text-amber-500",
            tone === "ok" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
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

function IpsRowItem({ row }: { row: IpsRow }) {
  const tone = row.breached
    ? row.severity === "critical"
      ? "critical"
      : "warning"
    : "ok";

  return (
    <li
      data-testid="ips-row"
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
            <span className="font-medium" data-testid="ips-subject">
              {row.subject}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {row.kindLabel}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {row.constraintLabel} · {row.limitLabel}
          </div>
        </div>
        <div className="text-right">
          <div
            data-testid="ips-weight"
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
          data-testid="ips-bar"
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
          data-testid="ips-detail"
          className={cn(
            "mt-2 text-sm font-medium",
            tone === "critical"
              ? "text-destructive"
              : "text-amber-600 dark:text-amber-500",
          )}
        >
          {row.breachDetail}
        </p>
      )}
    </li>
  );
}

export default IpsPage;
