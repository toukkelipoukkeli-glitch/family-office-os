import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  analyzeFundingPlan,
  formatFundedRatio,
  GOAL_CATEGORY_LABELS,
  seededFundingPlan,
  type FundingPlan,
  type FundingSummary,
  type GoalFunding,
} from "@/lib/goals";
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

/** A horizontal funded-ratio meter clamped to [0, 100]% with the over-funded marker. */
function FundedMeter({
  ratioPct,
  funded,
}: {
  ratioPct: number;
  funded: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, ratioPct));
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="presentation"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          funded
            ? "bg-[var(--color-chart-up)]"
            : "bg-[var(--color-chart-down)]",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export interface GoalFundingPageProps {
  /** Optional plan override (mainly for tests); defaults to the seeded fixture. */
  plan?: FundingPlan;
}

/**
 * Goal & liability funding page — the read-only "are our obligations funded?"
 * view.
 *
 * It surfaces the aggregate funded ratio, the dedicated-vs-shortfall split, and
 * a per-goal table showing each dated goal's target, dedicated capital grown to
 * its due date, funded ratio, and funding gap. Everything is derived from the
 * deterministic {@link analyzeFundingPlan} engine.
 */
export function GoalFundingPage({ plan }: GoalFundingPageProps) {
  const fundingPlan = plan ?? seededFundingPlan;
  const summary: FundingSummary = React.useMemo(
    () => analyzeFundingPlan(fundingPlan),
    [fundingPlan],
  );
  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary (no-op when reporting === base). Funded-ratio progress bars
  // are scale-invariant, so only the labelled values change unit.
  const money = makeMoney(useReportingMoney());

  const totalTarget = num(summary.totalTarget);
  const covered = num(summary.dedicatedCovered);
  const gap = num(summary.totalGap);
  const coveredPct = totalTarget > 0 ? (covered / totalTarget) * 100 : 100;
  const gapPct = Math.max(0, 100 - coveredPct);

  const allFunded = summary.shortfallCount === 0;

  return (
    <AppShell
      title={<>Goal &amp; liability funding</>}
      backTestId="goals-back"
      mainClassName="space-y-6"
      mainTestId="goals-page"
    >
        <p
          className="text-sm text-muted-foreground"
          data-testid="goals-subtitle"
        >
          {fundingPlan.name} — asset-liability matching across{" "}
          <span className="font-medium text-foreground">
            {summary.goals.length} dated goals
          </span>
          . Each goal's dedicated capital is grown to its due date and compared
          to the amount required.
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-target"
            label="Total target"
            value={money(totalTarget)}
            hint={`${summary.goals.length} goals`}
            icon={<Target className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-dedicated"
            label="Dedicated (today)"
            value={money(num(summary.totalDedicatedNow))}
            hint={`${money(num(summary.totalDedicatedAtDue))} grown to due`}
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-gap"
            label="Funding gap"
            value={money(gap)}
            hint={`${summary.shortfallCount} of ${summary.goals.length} short`}
            tone={gap > 0 ? "down" : "up"}
            icon={
              gap > 0 ? (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )
            }
          />
          <Kpi
            testId="kpi-funded-ratio"
            label="Funded ratio"
            value={formatFundedRatio(summary.fundedRatio)}
            hint={
              allFunded
                ? "all goals funded"
                : `${summary.fundedCount} fully funded`
            }
            tone={allFunded ? "up" : "down"}
            icon={
              allFunded ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : (
                <Coins className="size-3.5" aria-hidden="true" />
              )
            }
          />
        </section>

        {/* Dedicated-vs-shortfall split */}
        <Card>
          <CardHeader>
            <CardTitle>Dedicated vs. shortfall</CardTitle>
            <CardDescription>
              Of the {money(totalTarget, false)} required across all goals
              (in due-date money), how much is covered by dedicated capital and
              how much is still short. Surpluses are capped at each goal's target
              so they cannot mask another goal's gap.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              data-testid="split-bar"
              data-covered-pct={coveredPct.toFixed(2)}
              className="flex h-8 w-full overflow-hidden rounded-md border border-border"
            >
              <div
                className="flex items-center justify-center bg-[var(--color-chart-up)] text-xs font-medium text-white"
                style={{ width: `${coveredPct}%` }}
                data-testid="split-covered"
                title={`Dedicated ${money(covered)}`}
              >
                {coveredPct >= 12 ? "Dedicated" : ""}
              </div>
              {gapPct > 0 && (
                <div
                  className="flex items-center justify-center bg-[var(--color-chart-down)] text-xs font-medium text-white"
                  style={{ width: `${gapPct}%` }}
                  data-testid="split-shortfall"
                  title={`Shortfall ${money(gap)}`}
                >
                  {gapPct >= 12 ? "Shortfall" : ""}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-sm bg-[var(--color-chart-up)]" />
                Dedicated{" "}
                <span className="font-medium tabular-nums">
                  {money(covered, false)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-sm bg-[var(--color-chart-down)]" />
                Shortfall{" "}
                <span className="font-medium tabular-nums">
                  {money(gap, false)}
                </span>
              </span>
              <span
                className="ml-auto font-medium tabular-nums"
                data-testid="agg-ratio"
              >
                {formatFundedRatio(summary.fundedRatio)} funded
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Per-goal table */}
        <Card>
          <CardHeader>
            <CardTitle>Funding by goal</CardTitle>
            <CardDescription>
              Ordered by priority, then by how soon each goal comes due.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="goal-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Goal</th>
                    <th className="py-2 pr-4 text-right font-medium">Due</th>
                    <th className="py-2 pr-4 text-right font-medium">Target</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Dedicated @ due
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">Gap</th>
                    <th className="py-2 pl-4 font-medium">Funded</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.goals.map((g) => (
                    <GoalRow key={g.goal.id} f={g} money={money} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
    </AppShell>
  );
}

function GoalRow({ f, money }: { f: GoalFunding; money: MoneyFn }) {
  const ratioPct = f.fundedRatio.times(100).toNumber();
  const dueLabel =
    f.goal.dueYears === 0
      ? "now"
      : `${f.goal.dueYears} ${f.goal.dueYears === 1 ? "yr" : "yrs"}`;
  return (
    <tr
      className="border-b border-border/60 last:border-0"
      data-testid="goal-row"
      data-goal-id={f.goal.id}
      data-funded={f.funded ? "true" : "false"}
    >
      <td className="py-3 pr-4">
        <div className="font-medium">{f.goal.name}</div>
        <div className="text-xs text-muted-foreground">
          {GOAL_CATEGORY_LABELS[f.goal.category]}
        </div>
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
        {dueLabel}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {money(num(f.target))}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {money(num(f.dedicatedAtDue))}
      </td>
      <td
        className={cn(
          "py-3 pr-4 text-right tabular-nums",
          f.gap.isPositive() && "text-[var(--color-chart-down)]",
        )}
      >
        {f.gap.isPositive() ? money(num(f.gap)) : "—"}
      </td>
      <td className="py-3 pl-4">
        <div className="flex items-center gap-2">
          <FundedMeter ratioPct={ratioPct} funded={f.funded} />
          <span
            className="w-12 shrink-0 text-right text-xs font-medium tabular-nums"
            data-testid="goal-ratio"
          >
            {formatFundedRatio(f.fundedRatio)}
          </span>
          {f.funded ? (
            <CheckCircle2
              className="size-4 shrink-0 text-[var(--color-chart-up)]"
              aria-label="funded"
            />
          ) : (
            <AlertTriangle
              className="size-4 shrink-0 text-[var(--color-chart-down)]"
              aria-label="short"
            />
          )}
        </div>
      </td>
    </tr>
  );
}

export default GoalFundingPage;
