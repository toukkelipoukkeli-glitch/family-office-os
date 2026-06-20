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
  assetClassLabel,
  consolidateLookThrough,
  directGross,
  type EntityHoldings,
  type ExposureLine,
  LOOKTHROUGH_ENTITIES,
  LOOKTHROUGH_HOLDINGS,
  LOOKTHROUGH_ROOT_ID,
  type LookThroughReport,
} from "@/lib/lookthrough";
import type { Entity } from "@/lib/org";

import { formatMoneyCompact, formatPct } from "./format";

export interface LookThroughViewProps {
  entities?: readonly Entity[];
  holdings?: readonly EntityHoldings[];
  /** Initial root entity id; defaults to the fixture trust. */
  rootId?: string;
}

/** Stat tile. */
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4" data-testid="lt-stat">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Contribution drill-down for the selected asset-class line. */
function ContributionPanel({ line }: { line: ExposureLine | null }) {
  if (!line) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="lt-contrib-empty"
      >
        Select an asset class to see which entities it looks through.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="lt-contrib">
      <div>
        <h3 className="text-base font-semibold" data-testid="lt-contrib-name">
          {assetClassLabel(line.assetClass)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatMoneyCompact(line.value)} look-through ·{" "}
          {formatPct(line.weight)} of total
        </p>
      </div>
      <ul className="space-y-2" data-testid="lt-contrib-rows">
        {line.contributions.map((c) => (
          <li
            key={c.entityId}
            data-testid="lt-contrib-row"
            data-entity-id={c.entityId}
            className="rounded-md border border-border p-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="truncate font-medium">{c.entityName}</span>
              <span className="tabular-nums font-semibold">
                {formatMoneyCompact(c.attributed)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>gross {formatMoneyCompact(c.gross)}</span>
              <span>× {formatPct(c.effectivePct)} owned</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Charted cross-entity look-through view: consolidates the org hierarchy and
 * per-entity holdings into the chosen root's *true underlying exposure* by
 * asset class, with a donut + bar chart, a breakdown table, and a per-entity
 * contribution drill-down. Pure and deterministic; fed by offline fixtures.
 */
export function LookThroughView({
  entities = LOOKTHROUGH_ENTITIES,
  holdings = LOOKTHROUGH_HOLDINGS,
  rootId = LOOKTHROUGH_ROOT_ID,
}: LookThroughViewProps) {
  // Roots the user can report from: any entity that owns something.
  const rootOptions = React.useMemo(() => entities, [entities]);

  const [selectedRoot, setSelectedRoot] = React.useState(rootId);
  React.useEffect(() => setSelectedRoot(rootId), [rootId]);

  const report: LookThroughReport = React.useMemo(
    () => consolidateLookThrough(entities, holdings, selectedRoot),
    [entities, holdings, selectedRoot],
  );

  const [selectedClass, setSelectedClass] = React.useState<string | null>(null);
  // Reset the drill-down when the root (and thus the lines) changes.
  React.useEffect(() => {
    setSelectedClass(report.lines[0]?.assetClass ?? null);
  }, [report]);

  const selectedLine =
    report.lines.find((l) => l.assetClass === selectedClass) ?? null;

  // Compare the root's own direct book value to its consolidated look-through.
  const ownDirect = directGross(holdings, selectedRoot, report.currency);

  const donutData: DonutDatum[] = report.lines.map((l, i) => ({
    label: assetClassLabel(l.assetClass),
    value: l.value.amount.toNumber(),
    color: seriesColor(i),
  }));

  const barData: BarDatum[] = report.lines.map((l) => ({
    label: assetClassLabel(l.assetClass),
    value: l.value.amount.toNumber(),
  }));

  return (
    <div className="space-y-6" data-testid="lookthrough-view">
      {/* Root selector + summary stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Consolidate from
          </span>
          <select
            data-testid="lt-root-select"
            value={selectedRoot}
            onChange={(e) => setSelectedRoot(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-72"
          >
            {rootOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Look-through value"
          value={formatMoneyCompact(report.total)}
          sub={`owned by ${report.rootName}`}
        />
        <Stat label="Asset classes" value={report.lines.length.toString()} />
        <Stat
          label="Top exposure"
          value={
            report.lines[0]
              ? assetClassLabel(report.lines[0].assetClass)
              : "—"
          }
          sub={
            report.lines[0] ? formatPct(report.lines[0].weight) + " of total" : undefined
          }
        />
        <Stat
          label="Direct book value"
          value={formatMoneyCompact(ownDirect)}
          sub="root's own balance sheet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        {/* Charts + table */}
        <div className="space-y-6">
          <Card data-testid="lt-donut-card">
            <CardHeader>
              <CardTitle className="text-base">
                Look-through allocation
              </CardTitle>
              <CardDescription>
                True underlying exposure by asset class, seen through every
                ownership stake.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                {report.lines.length > 0 ? (
                  <DonutChart
                    data={donutData}
                    size={220}
                    thickness={0.42}
                    centerLabel={formatMoneyCompact(report.total)}
                  />
                ) : (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="lt-empty"
                  >
                    No look-through exposure for this root.
                  </p>
                )}
                <ul className="w-full space-y-1.5" data-testid="lt-legend">
                  {report.lines.map((l, i) => (
                    <li
                      key={l.assetClass}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-testid="lt-legend-item"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: seriesColor(i) }}
                        />
                        <span className="truncate">
                          {assetClassLabel(l.assetClass)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPct(l.weight)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="lt-bar-card">
            <CardHeader>
              <CardTitle className="text-base">Exposure by value</CardTitle>
              <CardDescription>
                Consolidated value the family owns in each class.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.lines.length > 0 ? (
                <div className="overflow-x-auto">
                  <BarChart data={barData} width={560} height={220} colorByIndex />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data.</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="lt-table-card">
            <CardHeader>
              <CardTitle className="text-base">Asset-class breakdown</CardTitle>
              <CardDescription>
                Click a row to see the entities it looks through.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm" data-testid="lt-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Asset class</th>
                    <th className="py-2 text-right font-medium">
                      Look-through
                    </th>
                    <th className="py-2 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((l, i) => {
                    const active = l.assetClass === selectedClass;
                    return (
                      <tr
                        key={l.assetClass}
                        data-testid="lt-table-row"
                        data-asset-class={l.assetClass}
                        data-selected={active ? "true" : "false"}
                        onClick={() => setSelectedClass(l.assetClass)}
                        className={`cursor-pointer border-b border-border/60 ${
                          active ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ background: seriesColor(i) }}
                            />
                            {assetClassLabel(l.assetClass)}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {formatMoneyCompact(l.value)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatPct(l.weight)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-sm font-semibold">
                    <td className="py-2">Total</td>
                    <td
                      className="py-2 text-right tabular-nums"
                      data-testid="lt-table-total"
                    >
                      {formatMoneyCompact(report.total)}
                    </td>
                    <td className="py-2 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Contribution drill-down */}
        <Card data-testid="lt-contrib-card">
          <CardHeader>
            <CardTitle className="text-base">Look-through detail</CardTitle>
            <CardDescription>Entity-by-entity attribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionPanel line={selectedLine} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Full-page wrapper around {@link LookThroughView} with app chrome and back
 * navigation. Routed at `#/lookthrough` and exercised by the Playwright visual
 * check at desktop and mobile viewports.
 */
export function LookThroughPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Cross-entity look-through
          </h1>
          <a
            href="#/"
            data-testid="lookthrough-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-sm text-muted-foreground">
          Consolidate the family structure and roll up each entity's holdings by
          the effective ownership stake — the family's true underlying exposure,
          seen through every layer of holdcos, funds and SPVs. Rendered from
          deterministic fixtures.
        </p>
        <LookThroughView />
      </main>
    </div>
  );
}

export default LookThroughPage;
