import * as React from "react";
import {
  AlertTriangle,
  Landmark,
  Scale,
  ShieldCheck,
  Users,
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
  analyzeEstate,
  formatCoverage,
  seededEstatePlan,
  type EstateAnalysis,
  type EstatePlan,
  type LiquidityClass,
} from "@/lib/estate";
import { cn } from "@/lib/utils";

import { SuccessionFlow } from "./SuccessionFlow";

const RELATION_LABELS: Record<string, string> = {
  spouse: "Spouse (marital)",
  child: "Child",
  relative: "Relative",
  charity: "Charity",
  other: "Other",
};

function money(currency: string, value: number, compactN = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compactN ? "compact" : "standard",
    maximumFractionDigits: compactN ? 1 : 0,
  }).format(value);
}

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

export interface EstatePlannerPageProps {
  /** Optional plan override (mainly for tests); defaults to the seeded fixture. */
  plan?: EstatePlan;
}

/**
 * Estate & succession planner — the read-only "what happens at death" page.
 *
 * It surfaces the estate-tax build-up, the **liquidity-at-death** coverage (can
 * settlement be paid without a forced fire-sale?), the funding waterfall, the
 * per-beneficiary net inheritance, and the entity → beneficiary succession flow.
 * Everything is derived from the deterministic {@link analyzeEstate} engine.
 */
export function EstatePlannerPage({ plan }: EstatePlannerPageProps) {
  const estatePlan = plan ?? seededEstatePlan;
  const analysis: EstateAnalysis = React.useMemo(
    () => analyzeEstate(estatePlan),
    [estatePlan],
  );
  const ccy = analysis.currency;
  const num = (m: { amount: { toNumber(): number } }) => m.amount.toNumber();

  const coveragePct = analysis.coverageRatio.times(100).toNumber();
  const coverageClamped = Math.min(100, Math.max(0, coveragePct));

  // Liquidity vs. settlement-need stacked bar: how much of the need is met by
  // each (post-haircut) liquid tier, with the illiquid backstop after.
  const need = num(analysis.settlementNeed);
  const liquid = num(analysis.liquidAvailable);

  return (
    <AppShell
      title={<>Estate &amp; succession planner</>}
      backTestId="estate-back"
      mainClassName="space-y-6"
      mainTestId="estate-page"
    >
        <p className="text-sm text-muted-foreground" data-testid="estate-subtitle">
          {estatePlan.name} — modelling the succession of{" "}
          <span className="font-medium text-foreground">
            {estatePlan.principal}
          </span>
          .
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-gross"
            label="Gross estate"
            value={money(ccy, num(analysis.grossEstate))}
            hint={`${money(ccy, num(analysis.totalDebts))} debts · ${money(
              ccy,
              num(analysis.adminCost),
            )} admin`}
            icon={<Landmark className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-taxable"
            label="Taxable estate"
            value={money(ccy, num(analysis.taxableEstate))}
            hint={`after ${money(ccy, num(analysis.exemptionApplied))} exemption`}
            icon={<Scale className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-tax"
            label="Estate tax due"
            value={money(ccy, num(analysis.estateTax))}
            hint={`${(estatePlan.taxRate * 100).toFixed(0)}% marginal rate`}
            tone="down"
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-coverage"
            label="Liquidity coverage"
            value={formatCoverage(analysis.coverageRatio)}
            hint={
              analysis.covered
                ? "settlement fully liquid"
                : `${money(ccy, num(analysis.shortfall))} short`
            }
            tone={analysis.covered ? "up" : "down"}
            icon={
              analysis.covered ? (
                <ShieldCheck className="size-3.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-3.5" aria-hidden="true" />
              )
            }
          />
        </section>

        {/* Liquidity-at-death */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liquidity at death</CardTitle>
            <CardDescription>
              Can the estate settle {money(ccy, need)} of tax, debt and
              administration out of liquid assets — without a forced sale of the
              operating company, forest or art?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              data-testid="coverage-verdict"
              data-covered={analysis.covered}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4",
                analysis.covered
                  ? "border-[var(--color-chart-up)]/40 bg-[var(--color-chart-up)]/5"
                  : "border-[var(--color-chart-down)]/40 bg-[var(--color-chart-down)]/5",
              )}
            >
              {analysis.covered ? (
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-up)]"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-down)]"
                  aria-hidden="true"
                />
              )}
              <div className="text-sm">
                <p className="font-medium">
                  {analysis.covered
                    ? "Settlement is fully covered by liquid assets."
                    : "Liquidity shortfall — settlement would force an illiquid sale."}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {money(ccy, liquid)} of post-haircut liquid assets vs{" "}
                  {money(ccy, need)} needed —{" "}
                  <span
                    className={cn(
                      "font-medium",
                      analysis.covered
                        ? "text-[var(--color-chart-up)]"
                        : "text-[var(--color-chart-down)]",
                    )}
                  >
                    {formatCoverage(analysis.coverageRatio)} coverage
                  </span>
                  {!analysis.covered && (
                    <>
                      {" "}
                      ({money(ccy, num(analysis.shortfall))} short)
                    </>
                  )}
                  .
                </p>
              </div>
            </div>

            {/* Coverage meter */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Liquid coverage of settlement need</span>
                <span className="tabular-nums">
                  {formatCoverage(analysis.coverageRatio)}
                </span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
                data-testid="coverage-meter"
                role="meter"
                aria-valuenow={Math.round(coverageClamped)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={formatCoverage(analysis.coverageRatio)}
                aria-label="liquidity coverage of settlement need"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    analysis.covered
                      ? "bg-[var(--color-chart-up)]"
                      : "bg-[var(--color-chart-down)]",
                  )}
                  style={{ width: `${coverageClamped}%` }}
                  data-testid="coverage-fill"
                />
              </div>
            </div>

            {/* Funding waterfall */}
            <div>
              <h3 className="mb-2 text-sm font-medium">Settlement funding waterfall</h3>
              <table className="w-full text-sm" data-testid="waterfall-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">Tapped tier</th>
                    <th className="py-2 text-right font-medium">Gross sold</th>
                    <th className="py-2 text-right font-medium">Net realized</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.fundingWaterfall.length === 0 && (
                    <tr data-testid="waterfall-empty">
                      <td
                        colSpan={3}
                        className="py-3 text-center text-muted-foreground"
                      >
                        Nothing to settle.
                      </td>
                    </tr>
                  )}
                  {analysis.fundingWaterfall.map((step) => (
                    <tr
                      key={step.cls}
                      data-testid="waterfall-row"
                      data-cls={step.cls}
                      className="border-b border-border/60"
                    >
                      <td className="py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2",
                            step.cls === "illiquid" &&
                              "text-[var(--color-chart-down)]",
                          )}
                        >
                          <span
                            className="inline-block size-2.5 rounded-sm"
                            style={{ background: tierColor(step.cls) }}
                          />
                          {step.label}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(ccy, num(step.grossUsed))}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(ccy, num(step.netUsed))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Estate-tax build-up */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Estate-tax build-up</CardTitle>
              <CardDescription>
                From gross estate to tax due, line by line.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm" data-testid="tax-table">
                <tbody>
                  <TaxRow label="Gross estate" value={money(ccy, num(analysis.grossEstate))} />
                  <TaxRow
                    label="Less: debts"
                    value={`(${money(ccy, num(analysis.totalDebts))})`}
                    muted
                  />
                  <TaxRow
                    label="Less: administration"
                    value={`(${money(ccy, num(analysis.adminCost))})`}
                    muted
                  />
                  <TaxRow
                    label="Less: marital / charitable"
                    value={`(${money(ccy, num(analysis.exemptBequests))})`}
                    muted
                  />
                  <TaxRow
                    label="Net estate"
                    value={money(ccy, num(analysis.netEstate))}
                    strong
                  />
                  <TaxRow
                    label="Less: lifetime exemption"
                    value={`(${money(ccy, num(analysis.exemptionApplied))})`}
                    muted
                  />
                  <TaxRow
                    label="Taxable estate"
                    value={money(ccy, num(analysis.taxableEstate))}
                    strong
                  />
                  <TaxRow
                    testId="tax-row-total"
                    label={`Estate tax @ ${(estatePlan.taxRate * 100).toFixed(0)}%`}
                    value={money(ccy, num(analysis.estateTax))}
                    strong
                    tone="down"
                  />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Beneficiaries */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" aria-hidden="true" />
                Who inherits what
              </CardTitle>
              <CardDescription>
                Net inheritance per beneficiary, after each share&apos;s tax.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2" data-testid="beneficiary-list">
                {analysis.beneficiaryShares.map((s) => (
                  <li
                    key={s.beneficiaryId}
                    data-testid="beneficiary-row"
                    data-beneficiary={s.beneficiaryId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {RELATION_LABELS[s.relation] ?? s.relation}
                        {s.tax.isPositive() && (
                          <>
                            {" · "}
                            tax {money(ccy, num(s.tax))}
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="text-sm font-semibold">
                        {money(ccy, num(s.net))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Succession flow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Succession flow</CardTitle>
            <CardDescription>
              How value passes from the estate, through each holding entity, to
              the beneficiaries — with estate tax and debts &amp; admin split off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <SuccessionFlow
                nodes={analysis.flowNodes}
                links={analysis.flowLinks}
                width={900}
                height={460}
                formatValue={(v) => money(ccy, v)}
                className="h-auto w-full min-w-[680px]"
                preserveAspectRatio="xMidYMid meet"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <LegendDot color="var(--color-chart-1)" label="Estate" />
              <LegendDot color="var(--color-chart-2)" label="Entity / vehicle" />
              <LegendDot color="var(--color-chart-up)" label="Beneficiary" />
              <LegendDot color="var(--color-chart-down)" label="Estate tax" />
              <LegendDot
                color="var(--color-muted-foreground)"
                label="Debts & admin"
              />
            </div>
          </CardContent>
        </Card>
    </AppShell>
  );
}

function tierColor(cls: LiquidityClass): string {
  if (cls === "cash") return "var(--color-chart-1)";
  if (cls === "marketable") return "var(--color-chart-2)";
  return "var(--color-chart-down)";
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block size-3 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

interface TaxRowProps {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "down";
  testId?: string;
}

function TaxRow({ label, value, muted, strong, tone, testId }: TaxRowProps) {
  return (
    <tr
      data-testid={testId}
      className={cn(
        "border-b border-border/50",
        strong && "border-border font-medium",
      )}
    >
      <td className={cn("py-2", muted && "text-muted-foreground")}>{label}</td>
      <td
        className={cn(
          "py-2 text-right tabular-nums",
          muted && "text-muted-foreground",
          tone === "down" && "text-[var(--color-chart-down)]",
        )}
      >
        {value}
      </td>
    </tr>
  );
}

export default EstatePlannerPage;
