import type { ReactNode } from "react";

import { ArrowLeft, Briefcase, Target, TrendingUp, Trophy } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type Deal,
  type Pipeline,
  type StageColumn,
  buildBoard,
  effectiveProbability,
  findDeal,
  formatMoney,
  formatPercent,
  formatWinRate,
  orderedStages,
  stageKindLabel,
  stageOf,
  summarizePipeline,
} from "@/lib/deals";
import { sampleDeals, samplePipeline } from "@/lib/deals/fixtures";
import { Money } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Base currency of the demo pipeline (all fixtures are EUR). */
const CURRENCY = "EUR";

const STAGE_KIND_STYLES: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  won: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  lost: "bg-destructive/10 text-destructive",
};

const DEAL_STATUS_STYLES: Record<Deal["status"], string> = {
  active: "bg-primary/10 text-primary",
  won: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  lost: "bg-destructive/10 text-destructive",
  abandoned: "bg-muted text-muted-foreground",
};

function StatBox({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border p-4"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  pipeline,
}: {
  deal: Deal;
  pipeline: Pipeline;
}) {
  const stage = stageOf(pipeline, deal);
  const amount = deal.amount
    ? formatMoney(Money.of(deal.amount.amount, deal.amount.currency))
    : "—";
  const prob = stage ? effectiveProbability(deal, stage) : null;

  return (
    <a
      href={`#/pipeline/${deal.id}`}
      data-testid="deal-card"
      data-deal-id={deal.id}
      className="block rounded-lg border border-border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="truncate text-sm font-medium">{deal.name}</p>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">
          {amount}
        </span>
        {prob !== null && (
          <span className="tabular-nums" data-testid="deal-prob">
            {formatPercent(prob)}
          </span>
        )}
      </div>
      {deal.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

function StageColumnView({
  column,
  pipeline,
}: {
  column: StageColumn;
  pipeline: Pipeline;
}) {
  return (
    <div
      data-testid="stage-column"
      data-stage-id={column.stage.id}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/50"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{column.stage.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatMoney(column.total)}
            {" · "}
            <span data-testid="stage-weighted">
              {formatMoney(column.weighted)} weighted
            </span>
          </p>
        </div>
        <span
          data-testid="stage-count"
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            STAGE_KIND_STYLES[column.stage.kind],
          )}
        >
          {column.count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {column.deals.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No deals
          </p>
        ) : (
          column.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} pipeline={pipeline} />
          ))
        )}
      </div>
    </div>
  );
}

function BoardView({
  pipeline,
  deals,
}: {
  pipeline: Pipeline;
  deals: Deal[];
}) {
  const board = buildBoard(pipeline, deals, CURRENCY);
  const summary = summarizePipeline(pipeline, deals, CURRENCY);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          icon={Briefcase}
          label="Open deals"
          value={String(summary.openCount)}
          testId="stat-open-count"
        />
        <StatBox
          icon={Target}
          label="Open value"
          value={formatMoney(summary.openTotal)}
          testId="stat-open-total"
        />
        <StatBox
          icon={TrendingUp}
          label="Weighted value"
          value={formatMoney(summary.weightedTotal)}
          testId="stat-weighted-total"
        />
        <StatBox
          icon={Trophy}
          label="Win rate"
          value={formatWinRate(summary.winRate)}
          testId="stat-win-rate"
        />
      </dl>

      <div
        data-testid="pipeline-board"
        className="flex gap-4 overflow-x-auto pb-2"
      >
        {board.map((column) => (
          <StageColumnView
            key={column.stage.id}
            column={column}
            pipeline={pipeline}
          />
        ))}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function DealDetail({
  deal,
  pipeline,
}: {
  deal: Deal;
  pipeline: Pipeline;
}) {
  const stage = stageOf(pipeline, deal);
  const amount = deal.amount
    ? formatMoney(Money.of(deal.amount.amount, deal.amount.currency))
    : "—";
  const prob = stage ? effectiveProbability(deal, stage) : null;

  const interactions = [...deal.interactions].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : -1,
  );

  return (
    <div data-testid="deal-detail" data-deal-id={deal.id} className="space-y-6">
      <a
        href="#/pipeline"
        data-testid="detail-back"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to board
      </a>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{deal.name}</CardTitle>
            <span
              data-testid="detail-status"
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                DEAL_STATUS_STYLES[deal.status],
              )}
            >
              {deal.status}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Stage" value={stage ? stage.name : "—"} />
            <Field
              label="Stage kind"
              value={stage ? stageKindLabel(stage.kind) : "—"}
            />
            <Field label="Amount" value={amount} />
            <Field
              label="Probability"
              value={prob !== null ? formatPercent(prob) : "—"}
            />
            <Field
              label="Asset class"
              value={deal.assetClass ?? "—"}
            />
            <Field label="Opened" value={deal.openedOn} />
            <Field
              label="Expected close"
              value={deal.expectedCloseOn ?? "—"}
            />
          </dl>
          {deal.note && (
            <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              {deal.note}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {deal.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts.</p>
          ) : (
            <ul className="divide-y divide-border">
              {deal.contacts.map((c) => (
                <li
                  key={c.id}
                  data-testid="contact-row"
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    {c.organization && (
                      <p className="truncate text-xs text-muted-foreground">
                        {c.organization}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {c.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interaction history</CardTitle>
        </CardHeader>
        <CardContent>
          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No interactions logged.
            </p>
          ) : (
            <ol className="space-y-3">
              {interactions.map((it) => (
                <li
                  key={it.id}
                  data-testid="interaction-row"
                  className="border-l-2 border-border pl-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {it.kind}
                    </span>
                    <time className="text-xs text-muted-foreground tabular-nums">
                      {it.occurredAt.slice(0, 10)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm">{it.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Deal pipeline board. Reads the current hash path: `#/pipeline` shows the
 * board; `#/pipeline/<dealId>` drills into a single deal. Pipeline + deals are
 * provided as props (defaulting to the offline fixtures) so the page is fully
 * deterministic and testable.
 */
export function PipelinePage({
  path = "/pipeline",
  pipeline = samplePipeline,
  deals = sampleDeals,
}: {
  path?: string;
  pipeline?: Pipeline;
  deals?: Deal[];
}) {
  const detailId = path.startsWith("/pipeline/")
    ? decodeURIComponent(path.slice("/pipeline/".length))
    : null;
  const selected = detailId ? findDeal(deals, detailId) : undefined;
  const stageCount = orderedStages(pipeline).length;

  return (
    <AppShell
      title="Deal pipeline"
      subtitle={
        <p className="text-xs text-muted-foreground">
          {pipeline.name} · {stageCount} stages
        </p>
      }
      mainClassName="space-y-6"
    >
        {detailId ? (
          selected ? (
            <DealDetail deal={selected} pipeline={pipeline} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <p data-testid="deal-not-found" className="text-sm text-muted-foreground">
                  No deal found for “{detailId}”.
                </p>
                <a
                  href="#/pipeline"
                  className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Back to board
                </a>
              </CardContent>
            </Card>
          )
        ) : (
          <BoardView pipeline={pipeline} deals={deals} />
        )}
    </AppShell>
  );
}

export default PipelinePage;
