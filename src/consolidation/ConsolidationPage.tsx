import * as React from "react";

import { BarChart, type BarDatum } from "@/components/charts/bar-chart";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/palette";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  consolidate,
  CONSOLIDATION_ENTITIES,
  CONSOLIDATION_INTERCOMPANY,
  CONSOLIDATION_ROOT_ID,
  type ConsolidationReport,
  type IntercompanyInvestment,
} from "@/lib/consolidation";
import { entityKindLabel } from "@/lib/org";
import type { Entity } from "@/lib/org";
import { useReportingMoney } from "@/lib/reporting-currency";
import type { Money } from "@/lib/money";

import { formatMoneyCompact, formatPct } from "./format";

export interface ConsolidationViewProps {
  entities?: readonly Entity[];
  intercompany?: readonly IntercompanyInvestment[];
  /** Initial root entity id; defaults to the fixture trust. */
  rootId?: string;
}

/** Stat tile. */
function Stat({
  label,
  value,
  sub,
  testId,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  testId: string;
  tone?: "default" | "negative" | "primary";
}) {
  const valueClass =
    tone === "negative"
      ? "text-destructive"
      : tone === "primary"
        ? "text-foreground"
        : "text-foreground";
  return (
    <div
      className="rounded-lg border border-border p-4"
      data-testid={testId}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}
        data-testid={`${testId}-value`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Charted multi-entity consolidation: from a family structure of trusts,
 * holdcos, LLCs, funds and SPVs with fractional ownership, produce one
 * consolidated net worth with intercompany eliminations so no value is
 * double-counted. Pure and deterministic; fed by offline fixtures.
 */
export function ConsolidationView({
  entities = CONSOLIDATION_ENTITIES,
  intercompany = CONSOLIDATION_INTERCOMPANY,
  rootId = CONSOLIDATION_ROOT_ID,
}: ConsolidationViewProps) {
  const [selectedRoot, setSelectedRoot] = React.useState(rootId);
  React.useEffect(() => setSelectedRoot(rootId), [rootId]);

  const report: ConsolidationReport = React.useMemo(
    () => consolidate({ entities, intercompany, rootId: selectedRoot }),
    [entities, intercompany, selectedRoot],
  );

  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary: convert the exact Money first, then format/scale. The
  // donut/bar geometry is a uniform scalar of the converted values, so only the
  // labelled units change. No-op when the reporting currency is the base.
  const { convertMoney } = useReportingMoney();
  const money = (m: Money): string => formatMoneyCompact(convertMoney(m));
  const num = (m: Money): number => convertMoney(m).amount.toNumber();

  // Bridge from gross NAV to consolidated net worth: each deduction shown as a
  // distinct bar so the reconciliation reads at a glance.
  const bridge: BarDatum[] = [
    { label: "Gross NAV", value: num(report.grossNav) },
    {
      label: "Eliminations",
      value: -num(report.intercompanyEliminations),
    },
    {
      label: "Minority int.",
      value: -num(report.minorityInterest),
    },
    {
      label: "Consolidated",
      value: num(report.consolidatedNetWorth),
    },
  ];

  // Owned-NAV split across entities (the positive contributors to the total).
  const ownedDonut: DonutDatum[] = report.entities
    .filter((e) => e.ownedNav.amount.gt(0))
    .map((e, i) => ({
      label: e.entityName,
      value: num(e.ownedNav),
      color: seriesColor(i),
    }));

  return (
    <div className="space-y-6" data-testid="consolidation-view">
      {/* Root selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Consolidate up to
          </span>
          <select
            data-testid="cons-root-select"
            value={selectedRoot}
            onChange={(e) => setSelectedRoot(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-72"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          testId="cons-kpi-gross"
          label="Gross NAV (sum of all)"
          value={money(report.grossNav)}
          sub={`${report.entities.length} entities`}
        />
        <Stat
          testId="cons-kpi-eliminations"
          label="Intercompany eliminations"
          value={`−${money(report.intercompanyEliminations)}`}
          sub={`${report.eliminations.length} intra-family stakes`}
          tone="negative"
        />
        <Stat
          testId="cons-kpi-minority"
          label="Minority interest"
          value={`−${money(report.minorityInterest)}`}
          sub="owned outside the root"
          tone="negative"
        />
        <Stat
          testId="cons-kpi-consolidated"
          label="Consolidated net worth"
          value={money(report.consolidatedNetWorth)}
          sub={`owned by ${report.rootName}`}
          tone="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reconciliation bridge */}
        <Card data-testid="cons-bridge-card">
          <CardHeader>
            <CardTitle className="text-base">Consolidation bridge</CardTitle>
            <CardDescription>
              Gross NAV less intercompany eliminations and minority interest
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={bridge}
              height={240}
              signed
              colorByIndex
              data-testid="cons-bridge-chart"
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Owned-NAV composition */}
        <Card data-testid="cons-donut-card">
          <CardHeader>
            <CardTitle className="text-base">Owned NAV by entity</CardTitle>
            <CardDescription>
              Each entity&apos;s standalone NAV × the root&apos;s effective stake
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {ownedDonut.length > 0 ? (
              <DonutChart
                data={ownedDonut}
                size={220}
                centerLabel={money(report.consolidatedNetWorth)}
                data-testid="cons-donut"
              />
            ) : (
              <p
                className="text-sm text-muted-foreground"
                data-testid="cons-donut-empty"
              >
                No owned value to chart.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entity breakdown */}
      <Card data-testid="cons-entities-card">
        <CardHeader>
          <CardTitle className="text-base">Entity breakdown</CardTitle>
          <CardDescription>
            Standalone NAV split into the root&apos;s owned share and minority
            interest
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Entity</th>
                  <th className="py-2 pr-4 font-medium">Kind</th>
                  <th className="py-2 pr-4 text-right font-medium">Owned</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Standalone NAV
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">Owned NAV</th>
                  <th className="py-2 text-right font-medium">Minority</th>
                </tr>
              </thead>
              <tbody>
                {report.entities.map((e) => (
                  <tr
                    key={e.entityId}
                    data-testid="cons-entity-row"
                    data-entity-id={e.entityId}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-4 font-medium">{e.entityName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {entityKindLabel(e.kind)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {formatPct(e.effectivePct)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {money(e.standaloneNav)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium">
                      {money(e.ownedNav)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {e.minorityInterest.isZero()
                        ? "—"
                        : money(e.minorityInterest)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold">
                  <td className="py-2 pr-4" colSpan={3}>
                    Gross NAV
                  </td>
                  <td
                    className="py-2 pr-4 text-right tabular-nums"
                    data-testid="cons-entities-gross"
                  >
                    {money(report.grossNav)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums" />
                  <td
                    className="py-2 text-right tabular-nums"
                    data-testid="cons-entities-minority"
                  >
                    {money(report.minorityInterest)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Eliminations detail */}
      <Card data-testid="cons-eliminations-card">
        <CardHeader>
          <CardTitle className="text-base">Intercompany eliminations</CardTitle>
          <CardDescription>
            Intra-family stakes removed so no underlying asset is counted twice
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.eliminations.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="cons-elim-empty"
            >
              No intercompany stakes to eliminate for this root.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Holder</th>
                    <th className="py-2 pr-4 font-medium">Investee</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Carrying value
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Holder owned
                    </th>
                    <th className="py-2 text-right font-medium">Eliminated</th>
                  </tr>
                </thead>
                <tbody>
                  {report.eliminations.map((el) => (
                    <tr
                      key={`${el.holderId}->${el.investeeId}`}
                      data-testid="cons-elim-row"
                      data-holder-id={el.holderId}
                      data-investee-id={el.investeeId}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium">
                        {el.holderName}
                      </td>
                      <td className="py-2 pr-4">{el.investeeName}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {money(el.carryingValue)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {formatPct(el.holderEffectivePct)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-destructive">
                        −{money(el.eliminated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-sm font-semibold">
                    <td className="py-2 pr-4" colSpan={4}>
                      Total eliminated
                    </td>
                    <td
                      className="py-2 text-right tabular-nums text-destructive"
                      data-testid="cons-elim-total"
                    >
                      −{money(report.intercompanyEliminations)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Full-page wrapper around {@link ConsolidationView} with app chrome and back
 * navigation. Routed at `#/consolidation` and exercised by the Playwright
 * visual check at desktop and mobile viewports.
 */
export function ConsolidationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Entity consolidation
          </h1>
          <a
            href="#/"
            data-testid="consolidation-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-sm text-muted-foreground">
          Roll the family structure of trusts, holdcos, LLCs, funds and SPVs up
          to a single consolidated net worth. Intercompany stakes are eliminated
          and minority interests removed, so no underlying asset is double-counted.
          Rendered from deterministic fixtures.
        </p>
        <ConsolidationView />
      </main>
    </div>
  );
}

export default ConsolidationPage;
