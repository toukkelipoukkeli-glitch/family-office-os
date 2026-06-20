import * as React from "react";
import {
  CalendarClock,
  Coins,
  Gift,
  Landmark,
  ListChecks,
  Scissors,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildTaxTimeline,
  CATEGORY_LABELS,
  seededTimelineInputs,
  TIMELINE_CATEGORIES,
  type TaxTimeline,
  type TaxTimelineInputs,
  type TimelineCategory,
  type TimelineEvent,
  type TimelineSeverity,
} from "@/lib/taxtimeline";
import { formatMoneyCompact, formatMoneyWhole } from "@/lib/format";
import { useReportingMoney, type ReportingMoney } from "@/lib/reporting-currency";
import type { Money } from "@/lib/money";
import { ExportMenu } from "@/components/ExportMenu";
import { taxTimelineExport } from "@/lib/export";
import { cn } from "@/lib/utils";

/** Per-category accent colour (reuses the shared chart palette). */
const CATEGORY_COLOR: Record<TimelineCategory, string> = {
  "estimated-tax": "var(--color-chart-1)",
  harvest: "var(--color-chart-up)",
  charitable: "var(--color-chart-2)",
  estate: "var(--color-chart-3)",
  filing: "var(--color-chart-4)",
};

const CATEGORY_ICON: Record<TimelineCategory, React.ReactNode> = {
  "estimated-tax": <Coins className="size-3.5" aria-hidden="true" />,
  harvest: <Scissors className="size-3.5" aria-hidden="true" />,
  charitable: <Gift className="size-3.5" aria-hidden="true" />,
  estate: <Landmark className="size-3.5" aria-hidden="true" />,
  filing: <ListChecks className="size-3.5" aria-hidden="true" />,
};

const SEVERITY_LABEL: Record<TimelineSeverity, string> = {
  deadline: "Deadline",
  action: "Action",
  info: "Info",
};

/** A pair of money formatters bound to a reporting currency. */
interface MoneyFns {
  /** Compact, e.g. `$12.5M`. */
  money: (value: number) => string;
  /** Full, no fractional cents, e.g. `$12,500,000`. */
  moneyFull: (value: number) => string;
}

/**
 * Build money formatters bound to the chosen reporting currency. Re-expresses
 * each base-USD figure at the render boundary (no-op when reporting === base).
 */
function makeMoney(rm: ReportingMoney): MoneyFns {
  return {
    money: (value: number) => formatMoneyCompact(rm.convert(value), rm.currency),
    moneyFull: (value: number) =>
      formatMoneyWhole(rm.convert(value), rm.currency),
  };
}

const num = (m: Money) => m.amount.toNumber();

/** Parse YYYY-MM-DD to a UTC epoch-day integer (UI-only, for bar placement). */
function epochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}

function Kpi({ testId, label, value, hint, icon }: KpiProps) {
  return (
    <div data-testid={testId} className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: TimelineSeverity }) {
  return (
    <span
      data-testid="event-severity"
      data-severity={severity}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        severity === "deadline" &&
          "bg-[var(--color-chart-down)]/15 text-[var(--color-chart-down)]",
        severity === "action" &&
          "bg-[var(--color-chart-1)]/15 text-[var(--color-chart-1)]",
        severity === "info" && "bg-muted text-muted-foreground",
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export interface TaxTimelinePageProps {
  /** Optional inputs override (mainly for tests); defaults to the seeded fixture. */
  inputs?: TaxTimelineInputs;
}

/**
 * Unified household tax timeline — the read-only "what tax action happens when"
 * page for one calendar year.
 *
 * It sequences the family's tax-relevant actions — quarterly estimated-tax
 * payments, tax-loss-harvest reviews (wash-sale aware), charitable gifting
 * windows and estate / annual-gifting deadlines — into ONE ordered,
 * deterministic timeline by composing the existing engines via
 * {@link buildTaxTimeline}. Nothing here moves money; it only schedules.
 */
export function TaxTimelinePage({ inputs }: TaxTimelinePageProps) {
  const timelineInputs = inputs ?? seededTimelineInputs;
  const timeline: TaxTimeline = React.useMemo(
    () => buildTaxTimeline(timelineInputs),
    [timelineInputs],
  );
  // Re-express every base-USD figure in the chosen reporting currency at the
  // render boundary (no-op when reporting === base). The timeline track is
  // positioned by date, not value, so only the labelled amounts change unit.
  const { money, moneyFull } = makeMoney(useReportingMoney());

  // Category filter: clicking a chip toggles it; null = show everything.
  const [activeCategory, setActiveCategory] =
    React.useState<TimelineCategory | null>(null);

  const visibleEvents = React.useMemo(
    () =>
      activeCategory
        ? timeline.events.filter((e) => e.category === activeCategory)
        : timeline.events,
    [timeline.events, activeCategory],
  );

  // Year track bounds: from the earliest to latest event date.
  const bounds = React.useMemo(() => {
    if (timeline.events.length === 0) return null;
    const days = timeline.events.map((e) => epochDay(e.date));
    const start = Math.min(...days);
    const end = Math.max(...days);
    return { start, end, span: Math.max(1, end - start) };
  }, [timeline.events]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Tax timeline
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={taxTimelineExport(timeline)}
              testId="taxtimeline-export"
            />
            <a
              href="#/"
              data-testid="timeline-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="taxtimeline-page"
      >
        <p
          className="text-sm text-muted-foreground"
          data-testid="timeline-subtitle"
        >
          Every tax-relevant action for{" "}
          <span className="font-medium text-foreground">{timeline.year}</span>,
          sequenced into one ordered plan —{" "}
          <span className="font-medium text-foreground">
            {timeline.events.length} events
          </span>
          , {timeline.deadlineCount} hard deadlines.
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            testId="kpi-tax"
            label="Estimated tax"
            value={money(num(timeline.estimatedTax))}
            hint={`${moneyFull(num(timeline.quarterlyPayment))} per quarter`}
            icon={<Coins className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-harvest"
            label="Harvestable loss"
            value={money(num(timeline.harvestableLoss))}
            hint="clean (wash-sale safe) losses to bank"
            icon={<Scissors className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-charitable"
            label="Charitable benefit"
            value={money(num(timeline.charitableBenefit))}
            hint="tax benefit from this year's gifts"
            icon={<Gift className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-deadlines"
            label="Hard deadlines"
            value={String(timeline.deadlineCount)}
            hint="dates that legally bind"
            icon={<CalendarClock className="size-3.5" aria-hidden="true" />}
          />
        </section>

        {/* Category filter chips */}
        <section
          className="flex flex-wrap gap-2"
          data-testid="category-filters"
          aria-label="Filter timeline by category"
        >
          <button
            type="button"
            data-testid="filter-all"
            aria-pressed={activeCategory === null}
            onClick={() => setActiveCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeCategory === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            All ({timeline.events.length})
          </button>
          {timeline.byCategory.map((c) => (
            <button
              key={c.category}
              type="button"
              data-testid={`filter-${c.category}`}
              data-category={c.category}
              aria-pressed={activeCategory === c.category}
              disabled={c.count === 0}
              onClick={() =>
                setActiveCategory((prev) =>
                  prev === c.category ? null : c.category,
                )
              }
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                activeCategory === c.category
                  ? "border-foreground bg-muted"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: CATEGORY_COLOR[c.category] }}
              />
              {CATEGORY_LABELS[c.category]} ({c.count})
            </button>
          ))}
        </section>

        {/* Year track (Gantt-style) */}
        {bounds && (
          <Card data-testid="year-track-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" aria-hidden="true" />
                {timeline.year} calendar track
              </CardTitle>
              <CardDescription>
                Each marker is a scheduled action; harvest blackout windows show
                as a band. Hover for detail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="year-track">
                {TIMELINE_CATEGORIES.filter(
                  (cat) =>
                    (!activeCategory || activeCategory === cat) &&
                    timeline.byCategory.find((c) => c.category === cat)!.count >
                      0,
                ).map((cat) => {
                  const catEvents = timeline.events.filter(
                    (e) => e.category === cat,
                  );
                  return (
                    <div
                      key={cat}
                      className="flex items-center gap-3"
                      data-testid="track-row"
                      data-category={cat}
                    >
                      <span className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {CATEGORY_ICON[cat]}
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <div className="relative h-6 flex-1 rounded bg-muted">
                        {catEvents.map((e) => {
                          const left =
                            ((epochDay(e.date) - bounds.start) / bounds.span) *
                            100;
                          if (e.windowEnd) {
                            const w =
                              ((epochDay(e.windowEnd) - epochDay(e.date)) /
                                bounds.span) *
                              100;
                            return (
                              <span
                                key={e.id}
                                data-testid="track-window"
                                title={`${e.title} — ${formatDate(
                                  e.date,
                                )} to ${formatDate(e.windowEnd)}`}
                                className="absolute top-1 h-4 rounded-sm opacity-40"
                                style={{
                                  left: `${left}%`,
                                  width: `${Math.max(1, w)}%`,
                                  background: CATEGORY_COLOR[cat],
                                }}
                              />
                            );
                          }
                          return (
                            <span
                              key={e.id}
                              data-testid="track-marker"
                              title={`${e.title} — ${formatDate(e.date)}`}
                              className={cn(
                                "absolute top-0.5 size-5 -translate-x-1/2 rounded-full border-2 border-background",
                                e.severity === "deadline" && "ring-2",
                              )}
                              style={{
                                left: `${left}%`,
                                background: CATEGORY_COLOR[cat],
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ordered event list — the core deliverable */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Sequenced actions
              {activeCategory && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {CATEGORY_LABELS[activeCategory]}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              The one ordered, deterministic plan: every action in date order
              across the year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2" data-testid="event-list">
              {visibleEvents.map((e) => (
                <EventRow key={e.id} event={e} moneyFull={moneyFull} />
              ))}
              {visibleEvents.length === 0 && (
                <li
                  className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
                  data-testid="event-empty"
                >
                  No actions in this category.
                </li>
              )}
            </ol>
          </CardContent>
        </Card>

        <p
          className="text-xs text-muted-foreground"
          data-testid="timeline-disclaimer"
        >
          Read-only planning view — it schedules and reconciles but never moves
          money, places a trade, files a return or makes a grant. Simplified tax
          assumptions; not tax advice.
        </p>
      </main>
    </div>
  );
}

function EventRow({
  event,
  moneyFull,
}: {
  event: TimelineEvent;
  moneyFull: (value: number) => string;
}) {
  return (
    <li
      data-testid="event-row"
      data-id={event.id}
      data-category={event.category}
      data-date={event.date}
      className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5"
    >
      <span
        className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
        style={{ background: CATEGORY_COLOR[event.category] }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {formatDate(event.date)}
            {event.windowEnd && <> – {formatDate(event.windowEnd)}</>}
          </span>
          <SeverityBadge severity={event.severity} />
        </div>
        <p className="mt-0.5 text-sm font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground">{event.detail}</p>
      </div>
      {event.amount && (
        <span
          data-testid="event-amount"
          className="shrink-0 text-right text-sm font-semibold tabular-nums"
        >
          {moneyFull(num(event.amount))}
        </span>
      )}
    </li>
  );
}

export default TaxTimelinePage;
