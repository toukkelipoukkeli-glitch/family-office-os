import * as React from "react";
import { Activity, Gauge, Sigma, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildFactorView,
  type FactorView,
} from "@/lib/factors/view";
import {
  FAMILY_OFFICE_FACTOR_FIXTURE,
  SYNTHETIC_FACTOR_FIXTURE,
} from "@/lib/factors";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

import { ContributionChart } from "./ContributionChart";
import { FactorBetasChart } from "./FactorBetasChart";

/** Format a decimal return as a signed percentage, e.g. `+0.83%`. */
function pct(value: number, { signed = false, digits = 2 } = {}): string {
  const s = `${(value * 100).toFixed(digits)}%`;
  if (!signed) return s;
  return value > 0 ? `+${s}` : s;
}

/** Format a beta to two decimals with an explicit sign. */
function beta(value: number): string {
  const s = value.toFixed(2);
  return value > 0 ? `+${s}` : s;
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up" | "down";
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

/** The selectable fixture books for the decomposition. */
const BOOKS = [
  {
    id: "family-office" as const,
    label: "Family office book",
    hint: "24 months, realistic residual",
    input: FAMILY_OFFICE_FACTOR_FIXTURE,
  },
  {
    id: "synthetic" as const,
    label: "Synthetic (clean)",
    hint: "noise-free, R² = 1",
    input: SYNTHETIC_FACTOR_FIXTURE,
  },
];

type BookId = (typeof BOOKS)[number]["id"];

export interface FactorAttributionPageProps {
  /** Optional precomputed view (mainly for tests); defaults to the fixture. */
  view?: FactorView;
}

/**
 * Factor & style return-decomposition page.
 *
 * Regresses the selected book's excess returns onto the six-factor set
 * (market, size, value, rate-duration, credit, FX) by OLS, then surfaces:
 * headline KPIs (R², alpha, factor-explained return, observations); a
 * **factor-betas** diverging-bar chart of the regression loadings; a
 * **return-decomposition** chart that walks alpha + each factor contribution to
 * the mean return; and a detail table backing it with betas, mean factor
 * returns and contributions. A book toggle switches the regressed series. Pure,
 * deterministic and offline — driven by the factor engine.
 */
export function FactorAttributionPage({ view }: FactorAttributionPageProps) {
  const [book, setBook] = React.useState<BookId>("family-office");

  const model = React.useMemo<FactorView>(() => {
    if (view) return view;
    const found = BOOKS.find((b) => b.id === book) ?? BOOKS[0];
    return buildFactorView(found.input);
  }, [view, book]);

  const alphaTone = model.alpha >= 0 ? "up" : "down";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Factor &amp; style attribution
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "factor-attribution",
                ["key", "label", "beta", "meanFactorReturn", "contribution"],
                model.loadings.map((r) => [
                  r.key,
                  r.label,
                  r.beta,
                  r.meanFactorReturn,
                  r.contribution,
                ]),
                model,
              )}
              testId="factors-export"
            />
            <a
              href="#/"
              data-testid="factors-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="factors-page"
      >
        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-rsquared"
            label="R² (fit)"
            value={pct(model.rSquared, { digits: 1 })}
            hint={`adj. ${pct(model.adjustedRSquared, { digits: 1 })}`}
            icon={<Gauge className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-alpha"
            label="Alpha (per period)"
            value={pct(model.alpha, { signed: true, digits: 2 })}
            hint="unexplained / skill"
            tone={alphaTone}
            icon={<Sigma className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-factor-return"
            label="Factor-explained"
            value={pct(model.totalFactorContribution, { signed: true })}
            hint="Σ β · mean factor"
            tone={model.totalFactorContribution >= 0 ? "up" : "down"}
            icon={<Activity className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-mean-return"
            label="Mean return"
            value={pct(model.meanPortfolioReturn, { signed: true })}
            hint={`${model.observations} periods`}
            tone={model.meanPortfolioReturn >= 0 ? "up" : "down"}
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Book toggle */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="book-toggle"
          role="group"
          aria-label="Regressed book"
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Book
          </span>
          {BOOKS.map((b) => {
            const disabled = Boolean(view); // controlled externally in tests
            return (
              <button
                key={b.id}
                type="button"
                data-testid="book-select"
                data-book={b.id}
                data-selected={book === b.id}
                aria-pressed={book === b.id}
                disabled={disabled}
                onClick={() => setBook(b.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  book === b.id
                    ? "border-border bg-muted font-medium"
                    : "border-transparent hover:bg-muted/60",
                  disabled && "cursor-default opacity-60",
                )}
                title={b.hint}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Factor betas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factor betas (loadings)</CardTitle>
            <CardDescription>
              The OLS sensitivity of the portfolio&apos;s excess return to each
              factor. Bars right of the axis are positive exposures, left are
              negative (a hedge / short tilt).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <FactorBetasChart
                loadings={model.loadings}
                width={640}
                formatValue={beta}
                className="h-auto w-full min-w-[360px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Return decomposition */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Return decomposition</CardTitle>
            <CardDescription>
              Alpha plus each factor&apos;s contribution (β × mean factor
              return) sum to the{" "}
              <span className="font-medium text-foreground">
                {pct(model.meanPortfolioReturn, { signed: true })}
              </span>{" "}
              mean period return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <ContributionChart
                view={model}
                width={640}
                formatValue={(v) => pct(v, { signed: true })}
                className="h-auto w-full min-w-[360px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factor detail</CardTitle>
            <CardDescription>
              Per-factor beta, mean factor return and return contribution.
              Contributions plus alpha reconcile to the mean portfolio return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[480px] border-collapse text-sm"
                data-testid="factors-table"
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Factor</th>
                    <th className="py-2 px-3 text-right font-medium">Beta</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Mean factor
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">
                      Contribution
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {model.loadings.map((l) => (
                    <tr
                      key={l.key}
                      data-testid="factor-row"
                      data-factor={l.key}
                      className="border-b border-border/60"
                    >
                      <td className="py-2 pr-3 font-medium">{l.label}</td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right tabular-nums",
                          l.beta < 0 && "text-[var(--color-chart-down)]",
                        )}
                      >
                        {beta(l.beta)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                        {pct(l.meanFactorReturn, { signed: true })}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-3 text-right tabular-nums",
                          l.contribution < 0 &&
                            "text-[var(--color-chart-down)]",
                        )}
                      >
                        {pct(l.contribution, { signed: true })}
                      </td>
                    </tr>
                  ))}
                  <tr
                    data-testid="factor-row-alpha"
                    className="border-b border-border/60"
                  >
                    <td className="py-2 pr-3 font-medium">Alpha (α)</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                      —
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                      —
                    </td>
                    <td
                      className={cn(
                        "py-2 pl-3 text-right tabular-nums",
                        model.alpha < 0 && "text-[var(--color-chart-down)]",
                      )}
                    >
                      {pct(model.alpha, { signed: true })}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr
                    className="border-t-2 border-border font-medium"
                    data-testid="factors-total"
                  >
                    <td className="py-2 pr-3">Mean portfolio return</td>
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3" />
                    <td
                      className={cn(
                        "py-2 pl-3 text-right tabular-nums",
                        model.meanPortfolioReturn < 0 &&
                          "text-[var(--color-chart-down)]",
                      )}
                      data-testid="factors-total-value"
                    >
                      {pct(model.explainedTotal, { signed: true })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default FactorAttributionPage;
