import * as React from "react";

import { Sparkline } from "@/components/charts/sparkline";
import {
  seededOverview,
  type OverviewKpi,
  type OverviewModel,
  type OverviewStatus,
} from "@/lib/home";
import { seededNetWorth } from "@/lib/networth";
import { cn } from "@/lib/utils";

/** Per-status presentation: accent dot colour + banner copy. */
const STATUS_META: Record<
  OverviewStatus,
  { dot: string; ring: string; label: string }
> = {
  ok: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
    label: "On track",
  },
  warning: {
    dot: "bg-amber-500",
    ring: "ring-amber-500/30",
    label: "Needs attention",
  },
  critical: {
    dot: "bg-red-500",
    ring: "ring-red-500/40",
    label: "Action required",
  },
};

/** One headline KPI tile, linking into its module. */
function KpiTile({ kpi }: { kpi: OverviewKpi }) {
  const meta = STATUS_META[kpi.status];
  return (
    <a
      href={kpi.href}
      data-testid="home-kpi"
      data-kpi={kpi.id}
      data-status={kpi.status}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border border-border bg-card p-5",
        "shadow-sm ring-1 ring-transparent transition hover:shadow-md hover:ring-2",
        meta.ring,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </span>
        <span
          aria-hidden
          data-testid="home-kpi-dot"
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)}
        />
      </div>
      <div
        data-testid="home-kpi-value"
        className="text-2xl font-semibold tracking-tight tabular-nums"
      >
        {kpi.value}
      </div>
      <div className="text-sm text-muted-foreground">{kpi.detail}</div>
      <div className="mt-auto pt-1 text-xs font-medium text-muted-foreground underline-offset-4 group-hover:underline">
        Open {kpi.module} →
      </div>
    </a>
  );
}

export interface HomeOverviewProps {
  /** The overview model; defaults to the seeded executive overview. */
  model?: OverviewModel;
}

/**
 * The executive home cockpit body: a status banner, a net-worth trend
 * sparkline, and a grid of headline KPI tiles drilling into every module.
 *
 * Pure and deterministic — rendered entirely from the seeded {@link OverviewModel}.
 */
export function HomeOverview({ model = seededOverview }: HomeOverviewProps) {
  const banner = STATUS_META[model.worstStatus];
  const trend = React.useMemo(
    () => seededNetWorth.total.points.map((p) => p.value.amount.toNumber()),
    [],
  );
  const netWorthKpi = model.kpis.find((k) => k.id === "net-worth");

  return (
    <div data-testid="home-overview" className="flex flex-col gap-8">
      <section
        data-testid="home-status-banner"
        data-status={model.worstStatus}
        className={cn(
          "flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn("h-3 w-3 rounded-full", banner.dot)}
          />
          <div>
            <div className="text-sm font-semibold">{banner.label}</div>
            <div className="text-sm text-muted-foreground">
              {model.openBreaches === 0 ? (
                "No open governance breaches across the book."
              ) : (
                <>
                  <span
                    data-testid="home-open-breaches"
                    className="font-medium text-foreground"
                  >
                    {model.openBreaches}
                  </span>{" "}
                  open governance breaches across IPS, alerts and risk limits.
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Net worth
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {netWorthKpi?.value}
            </div>
          </div>
          <Sparkline
            values={trend}
            width={140}
            height={40}
            color="var(--color-chart-1)"
            className="text-primary"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Headline metrics
        </h2>
        <div
          data-testid="home-kpi-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {model.kpis.map((kpi) => (
            <KpiTile key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default HomeOverview;
