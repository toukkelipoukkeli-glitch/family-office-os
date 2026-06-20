import * as React from "react";
import {
  Gift as GiftIcon,
  HandCoins,
  Landmark,
  PiggyBank,
  TrendingDown,
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
  analyzeGivingPlan,
  compareInKindVsCash,
  formatPct,
  givingEfficiency,
  seededGivingPlan,
  type Gift,
  type GivingAnalysis,
  type GivingPlan,
} from "@/lib/giving";
import { cn } from "@/lib/utils";

const RECIPIENT_LABELS: Record<string, string> = {
  "public-charity": "Public charity",
  daf: "Donor-advised fund",
  "private-foundation": "Private foundation",
};

const KIND_LABELS: Record<string, string> = {
  cash: "Cash",
  appreciated: "Appreciated asset",
};

function money(currency: string, value: number, compact = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
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

export interface GivingPageProps {
  /** Optional plan override (mainly for tests); defaults to the seeded fixture. */
  plan?: GivingPlan;
}

/**
 * Charitable giving planner — the read-only philanthropy page.
 *
 * It models gifting appreciated assets (capital-gains avoided + deduction
 * value), donor-advised-fund contributions, and a multi-year giving plan with
 * AGI ceilings and carryforward. The headline numbers — total tax benefit,
 * capital gains avoided, and the after-tax *net cost* of the giving program —
 * come straight from the deterministic {@link analyzeGivingPlan} engine.
 */
export function GivingPage({ plan }: GivingPageProps) {
  const givingPlan = plan ?? seededGivingPlan;
  const analysis: GivingAnalysis = React.useMemo(
    () => analyzeGivingPlan(givingPlan),
    [givingPlan],
  );
  const ccy = analysis.currency;
  const num = (m: { amount: { toNumber(): number } }) => m.amount.toNumber();

  // Largest appreciated gift in the plan drives the in-kind-vs-cash spotlight.
  const spotlight = React.useMemo(() => {
    const appreciated = givingPlan.years
      .flatMap((y) => y.gifts)
      .filter((g): g is Gift => g.kind === "appreciated");
    if (appreciated.length === 0) return null;
    const biggest = appreciated.reduce((a, b) =>
      b.fairMarketValue.compare(a.fairMarketValue) > 0 ? b : a,
    );
    return {
      gift: biggest,
      cmp: compareInKindVsCash(biggest, givingPlan.profile),
    };
  }, [givingPlan]);

  const efficiency = givingEfficiency(analysis);
  const maxYearBenefit = Math.max(
    1,
    ...analysis.yearResults.map((y) => num(y.totalBenefit)),
  );

  return (
    <AppShell
      title="Charitable giving planner"
      backTestId="giving-back"
      mainClassName="space-y-6"
      mainTestId="giving-page"
    >
        <p
          className="text-sm text-muted-foreground"
          data-testid="giving-subtitle"
        >
          {givingPlan.name} — modelling the tax economics of{" "}
          <span className="font-medium text-foreground">
            {money(ccy, num(analysis.totalGifted))}
          </span>{" "}
          of giving across {analysis.yearResults.length} years.
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-gifted"
            label="Total gifted"
            value={money(ccy, num(analysis.totalGifted))}
            hint="fair-market value to charity"
            icon={<GiftIcon className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-cg-avoided"
            label="Capital gains avoided"
            value={money(ccy, num(analysis.totalCapitalGainsAvoided))}
            hint="by gifting in kind, not selling"
            tone="up"
            icon={<TrendingDown className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-benefit"
            label="Total tax benefit"
            value={money(ccy, num(analysis.totalBenefit))}
            hint={`${money(ccy, num(analysis.totalIncomeTaxSaved))} income tax + CG`}
            tone="up"
            icon={<PiggyBank className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-net-cost"
            label="After-tax net cost"
            value={money(ccy, num(analysis.netCost))}
            hint={`${formatPct(efficiency)} of giving offset by tax`}
            icon={<HandCoins className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* In-kind spotlight */}
        {spotlight && (
          <Card data-testid="inkind-card">
            <CardHeader>
              <CardTitle className="text-base">
                Gift the stock, don&apos;t sell it
              </CardTitle>
              <CardDescription>
                Donating{" "}
                <span className="font-medium text-foreground">
                  {spotlight.gift.label}
                </span>{" "}
                ({money(ccy, num(spotlight.gift.fairMarketValue))} FMV) in kind
                vs. selling it, paying capital-gains tax, then donating the net
                cash.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Compare
                  testId="inkind-cg"
                  label="Capital gains tax avoided"
                  value={money(ccy, num(spotlight.cmp.capitalGainsIfSold))}
                  tone="up"
                />
                <Compare
                  testId="inkind-extra-deduction"
                  label="Extra deduction value"
                  value={money(ccy, num(spotlight.cmp.extraIncomeTaxSaved))}
                  tone="up"
                  hint="larger deduction (full FMV vs net cash)"
                />
                <Compare
                  testId="inkind-advantage"
                  label="In-kind advantage"
                  value={money(ccy, num(spotlight.cmp.inKindAdvantage))}
                  tone="up"
                  strong
                />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Sell-then-donate route deducts only{" "}
                {money(ccy, num(spotlight.cmp.cashRouteDeduction))} (after-tax
                cash); the in-kind route deducts the full{" "}
                {money(ccy, num(spotlight.cmp.inKindDeduction))} and skips the
                capital-gains tax entirely.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Multi-year plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="size-4" aria-hidden="true" />
              Multi-year giving plan
            </CardTitle>
            <CardDescription>
              Per-year deduction usage under AGI ceilings (with carryforward),
              capital-gains avoided, and total tax benefit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <table className="w-full text-sm" data-testid="plan-table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Year</th>
                  <th className="py-2 text-right font-medium">Gifted</th>
                  <th className="py-2 text-right font-medium">Deduction used</th>
                  <th className="py-2 text-right font-medium">Carry fwd</th>
                  <th className="py-2 text-right font-medium">CG avoided</th>
                  <th className="py-2 text-right font-medium">Tax benefit</th>
                </tr>
              </thead>
              <tbody>
                {analysis.yearResults.map((y) => (
                  <tr
                    key={y.year}
                    data-testid="plan-row"
                    data-year={y.year}
                    className="border-b border-border/60"
                  >
                    <td className="py-2 font-medium tabular-nums">{y.year}</td>
                    <td className="py-2 text-right tabular-nums">
                      {money(ccy, num(y.gifted))}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {money(ccy, num(y.deductionUsed))}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right tabular-nums",
                        num(y.carriedForward) > 0
                          ? "text-[var(--color-chart-down)]"
                          : "text-muted-foreground",
                      )}
                    >
                      {money(ccy, num(y.carriedForward))}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[var(--color-chart-up)]">
                      {money(ccy, num(y.capitalGainsAvoided))}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-[var(--color-chart-up)]">
                      {money(ccy, num(y.totalBenefit))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t border-border font-medium"
                  data-testid="plan-total-row"
                >
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">
                    {money(ccy, num(analysis.totalGifted))}
                  </td>
                  <td className="py-2" />
                  <td className="py-2" />
                  <td className="py-2 text-right tabular-nums text-[var(--color-chart-up)]">
                    {money(ccy, num(analysis.totalCapitalGainsAvoided))}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-chart-up)]">
                    {money(ccy, num(analysis.totalBenefit))}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Per-year benefit bar chart */}
            <div data-testid="benefit-chart">
              <h3 className="mb-2 text-sm font-medium">Tax benefit by year</h3>
              <div className="space-y-2">
                {analysis.yearResults.map((y) => {
                  const cg = num(y.capitalGainsAvoided);
                  const income = num(y.incomeTaxSaved);
                  const cgW = (cg / maxYearBenefit) * 100;
                  const incW = (income / maxYearBenefit) * 100;
                  return (
                    <div
                      key={y.year}
                      className="flex items-center gap-3"
                      data-testid="benefit-bar"
                      data-year={y.year}
                    >
                      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {y.year}
                      </span>
                      <div className="flex h-5 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full bg-[var(--color-chart-1)]"
                          style={{ width: `${incW}%` }}
                          data-testid="bar-income"
                          title={`Income tax saved ${money(ccy, income)}`}
                        />
                        <div
                          className="h-full bg-[var(--color-chart-up)]"
                          style={{ width: `${cgW}%` }}
                          data-testid="bar-cg"
                          title={`Capital gains avoided ${money(ccy, cg)}`}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                        {money(ccy, num(y.totalBenefit))}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <LegendDot color="var(--color-chart-1)" label="Income tax saved" />
                <LegendDot
                  color="var(--color-chart-up)"
                  label="Capital gains avoided"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gift detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gift-by-gift detail</CardTitle>
            <CardDescription>
              Each gift&apos;s embedded gain, capital-gains tax avoided, and
              deductible amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="gift-list">
              {analysis.giftBenefits.map((g) => (
                <li
                  key={g.giftId}
                  data-testid="gift-row"
                  data-gift={g.giftId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABELS[g.kind] ?? g.kind} ·{" "}
                      {RECIPIENT_LABELS[g.recipient] ?? g.recipient}
                      {g.capitalGainsAvoided.isPositive() && (
                        <>
                          {" · "}
                          <span className="text-[var(--color-chart-up)]">
                            {money(ccy, num(g.capitalGainsAvoided))} CG avoided
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="text-sm font-semibold">
                      {money(ccy, num(g.fairMarketValue))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground" data-testid="giving-disclaimer">
          Read-only model for planning only — it never moves money or makes a
          grant. Simplified tax assumptions; not tax advice.
        </p>
    </AppShell>
  );
}

interface CompareProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up";
  strong?: boolean;
}

function Compare({ testId, label, value, hint, tone, strong }: CompareProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border p-4",
        strong
          ? "border-[var(--color-chart-up)]/40 bg-[var(--color-chart-up)]/5"
          : "border-border",
      )}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "up" && "text-[var(--color-chart-up)]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
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

export default GivingPage;
