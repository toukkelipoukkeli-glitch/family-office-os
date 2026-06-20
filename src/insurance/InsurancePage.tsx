import * as React from "react";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  ShieldCheck,
  Umbrella,
} from "lucide-react";

import { ExportMenu } from "@/components/ExportMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  analyzeInsurance,
  CRITICAL_COVERAGE_RATIO,
  formatRatio,
  POLICY_KIND_LABELS,
  seededInsuranceBook,
  WELL_COVERED_RATIO,
  type CategorySummary,
  type CoverageGap,
  type GapSeverity,
  type InsuranceAnalysis,
  type InsuranceBook,
  type PolicyStatus,
} from "@/lib/insurance";
import { insuranceExport } from "@/lib/export";
import { formatMoney } from "@/lib/format";
import { useReportingMoney, type ReportingMoney } from "@/lib/reporting-currency";
import { cn } from "@/lib/utils";

/** A money formatter bound to a reporting currency. */
type MoneyFn = (value: number, compactN?: boolean) => string;

/**
 * Build a money formatter bound to the chosen reporting currency. Re-expresses
 * each base-USD figure at the render boundary (no-op when reporting === base).
 */
function makeMoney(rm: ReportingMoney): MoneyFn {
  return (value: number, compactN = true): string =>
    formatMoney(rm.convert(value), rm.currency, { compact: compactN });
}

const num = (m: { amount: { toNumber(): number } }) => m.amount.toNumber();

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "down" | "up";
  icon?: React.ReactNode;
}

function Kpi({ testId, label, value, hint, tone = "default", icon }: KpiProps) {
  return (
    <div data-testid={testId} className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "down" && "text-[var(--color-chart-down)]",
          tone === "up" && "text-[var(--color-chart-up)]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SEVERITY_META: Record<
  GapSeverity,
  { label: string; color: string; icon: React.ReactNode }
> = {
  critical: {
    label: "Critical",
    color: "var(--color-chart-down)",
    icon: <ShieldAlert className="size-4" aria-hidden="true" />,
  },
  warning: {
    label: "Warning",
    color: "var(--color-chart-2)",
    icon: <AlertTriangle className="size-4" aria-hidden="true" />,
  },
  info: {
    label: "Info",
    color: "var(--color-muted-foreground)",
    icon: <Info className="size-4" aria-hidden="true" />,
  },
};

const STATUS_LABELS: Record<PolicyStatus, string> = {
  active: "Active",
  lapsed: "Lapsed",
  pending: "Pending",
};

/** A category coverage-vs-exposure row, drawn as a labelled meter. */
function CoverageBar({ cat, money }: { cat: CategorySummary; money: MoneyFn }) {
  const hasExposure = !cat.exposure.isZero();
  const ratio = cat.coverageRatio;
  const pct = ratio ? ratio.times(100).toNumber() : null;
  const clamped = pct === null ? 100 : Math.min(100, Math.max(0, pct));
  const target = WELL_COVERED_RATIO.times(100).toNumber();
  const ok = ratio ? ratio.greaterThanOrEqualTo(WELL_COVERED_RATIO) : true;
  const critical = ratio ? ratio.lessThan(CRITICAL_COVERAGE_RATIO) : false;
  const fillColor = !hasExposure
    ? "var(--color-chart-1)"
    : critical
      ? "var(--color-chart-down)"
      : ok
        ? "var(--color-chart-up)"
        : "var(--color-chart-2)";

  return (
    <div data-testid="coverage-bar" data-kind={cat.kind}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{cat.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {money(num(cat.activeCoverage))}
          {hasExposure && (
            <>
              {" / "}
              {money(num(cat.exposure))}
            </>
          )}
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, background: fillColor }}
          data-testid="coverage-bar-fill"
        />
        {hasExposure && (
          <span
            className="absolute top-0 h-full w-px bg-foreground/40"
            style={{ left: `${target}%` }}
            aria-hidden="true"
            title={`Target ${formatRatio(WELL_COVERED_RATIO)}`}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasExposure ? (
          <>
            <span
              className="font-medium tabular-nums"
              style={{ color: fillColor }}
            >
              {ratio ? formatRatio(ratio) : "0%"}
            </span>{" "}
            of exposure insured
          </>
        ) : (
          <>No base exposure — judged within the liability tower</>
        )}
        {" · "}
        {cat.activeCount} active
        {cat.inactiveCount > 0 && ` · ${cat.inactiveCount} inactive`}
      </p>
    </div>
  );
}

export interface InsurancePageProps {
  /** Optional book override (mainly for tests); defaults to the seeded fixture. */
  book?: InsuranceBook;
}

/**
 * Insurance coverage tracker — the read-only "are we protected?" page.
 *
 * It surfaces total active cover and premium, each category's coverage measured
 * against its net-worth exposure, the liability-tower-vs-net-worth headline, the
 * coverage-gap flags, and the full policy schedule. Everything is derived from
 * the deterministic {@link analyzeInsurance} engine.
 */
export function InsurancePage({ book }: InsurancePageProps) {
  const insuranceBook = book ?? seededInsuranceBook;
  const analysis: InsuranceAnalysis = React.useMemo(
    () => analyzeInsurance(insuranceBook),
    [insuranceBook],
  );
  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary (no-op when reporting === base). Coverage meters are ratios
  // of same-currency values and are scale-invariant, so only labels change unit.
  const rm = useReportingMoney();
  const money = makeMoney(rm);
  const exportDataset = React.useMemo(
    () => insuranceExport(analysis, rm),
    [analysis, rm],
  );

  const towerRatio = analysis.liabilityCoverageRatio;
  const towerCovered = towerRatio
    ? towerRatio.greaterThanOrEqualTo(1)
    : false;

  const criticalCount = analysis.gaps.filter(
    (g) => g.severity === "critical",
  ).length;
  const warningCount = analysis.gaps.filter(
    (g) => g.severity === "warning",
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Insurance coverage tracker
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu dataset={exportDataset} testId="insurance-export" />
            <a
              href="#/"
              data-testid="insurance-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="insurance-page"
      >
        <p
          className="text-sm text-muted-foreground"
          data-testid="insurance-subtitle"
        >
          {insuranceBook.name} — coverage vs net-worth exposure, with gap flags.
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-coverage"
            label="Active coverage"
            value={money(num(analysis.totalActiveCoverage))}
            hint={`${analysis.activePolicyCount} active policies`}
            icon={<ShieldCheck className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-premium"
            label="Annual premium"
            value={money(num(analysis.totalAnnualPremium))}
            hint="across active policies"
          />
          <Kpi
            testId="kpi-tower"
            label="Liability tower"
            value={towerRatio ? formatRatio(towerRatio) : "—"}
            hint={`${money(num(analysis.liabilityTowerCoverage))} vs ${money(num(insuranceBook.exposure.netWorth),
            )} net worth`}
            tone={towerCovered ? "up" : "down"}
            icon={<Umbrella className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-gaps"
            label="Coverage gaps"
            value={String(analysis.gaps.length)}
            hint={`${criticalCount} critical · ${warningCount} warning`}
            tone={
              criticalCount > 0 ? "down" : warningCount > 0 ? "default" : "up"
            }
            icon={
              analysis.hasCriticalGap ? (
                <ShieldAlert className="size-3.5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-3.5" aria-hidden="true" />
              )
            }
          />
        </section>

        {/* Coverage vs exposure */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage vs exposure</CardTitle>
            <CardDescription>
              Active cover in each category, measured against the net-worth
              exposure it protects. The marker is the{" "}
              {formatRatio(WELL_COVERED_RATIO)} well-covered target.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5" data-testid="coverage-bars">
            {analysis.categories.map((cat) => (
              <CoverageBar key={cat.kind} cat={cat} money={money} />
            ))}
          </CardContent>
        </Card>

        {/* Coverage gaps + policy schedule */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Coverage-gap flags
              </CardTitle>
              <CardDescription>
                Where protection is thin, missing, lapsed or mispriced.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.gaps.length === 0 ? (
                <div
                  data-testid="gaps-empty"
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-chart-up)]/40 bg-[var(--color-chart-up)]/5 p-4 text-sm"
                >
                  <ShieldCheck
                    className="size-5 text-[var(--color-chart-up)]"
                    aria-hidden="true"
                  />
                  No coverage gaps — every exposure is well covered.
                </div>
              ) : (
                <ul className="space-y-2" data-testid="gap-list">
                  {analysis.gaps.map((gap) => (
                    <GapRow key={gap.id} gap={gap} money={money} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Policy schedule</CardTitle>
              <CardDescription>
                Every tracked policy, its limit and annual premium.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  data-testid="policy-table"
                >
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 font-medium">Policy</th>
                      <th className="py-2 text-right font-medium">Limit</th>
                      <th className="py-2 text-right font-medium">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insuranceBook.policies.map((p) => (
                      <tr
                        key={p.id}
                        data-testid="policy-row"
                        data-policy={p.id}
                        data-status={p.status}
                        className="border-b border-border/60"
                      >
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 truncate font-medium">
                              {p.name}
                            </span>
                            {p.status !== "active" && (
                              <span
                                className="shrink-0 rounded-sm border border-[var(--color-chart-down)]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-chart-down)]"
                                data-testid="policy-status-badge"
                              >
                                {STATUS_LABELS[p.status]}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {POLICY_KIND_LABELS[p.kind]} · {p.carrier}
                          </p>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {money(num(p.coverage))}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {money(num(p.annualPremium))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function GapRow({ gap, money }: { gap: CoverageGap; money: MoneyFn }) {
  const meta = SEVERITY_META[gap.severity];
  return (
    <li
      data-testid="gap-row"
      data-severity={gap.severity}
      data-scope={gap.scope}
      className="flex items-start gap-3 rounded-md border border-border p-3"
    >
      <span className="mt-0.5 shrink-0" style={{ color: meta.color }}>
        {meta.icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{gap.title}</p>
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            style={{ color: meta.color, background: `${meta.color}1a` }}
          >
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{gap.detail}</p>
        {gap.shortfall && (
          <p className="mt-0.5 text-xs font-medium text-[var(--color-chart-down)]">
            {money(num(gap.shortfall))} shortfall
          </p>
        )}
      </div>
    </li>
  );
}

export default InsurancePage;
