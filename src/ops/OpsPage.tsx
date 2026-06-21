import { Activity, AlertTriangle, GitMerge, Layers } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { opsSnapshot, type OpsUnit, type UnitStatus } from "./ops-data";
import {
  countByStatus,
  milestoneProgress,
  progressPercent,
  STATUS_ORDER,
  statusLabel,
  unitsByStatus,
} from "./ops-selectors";

const STATUS_STYLES: Record<UnitStatus, string> = {
  backlog: "bg-muted text-muted-foreground",
  active: "bg-primary text-primary-foreground",
  merged: "bg-secondary text-secondary-foreground",
  blocked: "bg-destructive text-destructive-foreground",
};

function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span
      data-testid="status-badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function UnitRow({ unit }: { unit: OpsUnit }) {
  return (
    <li
      data-testid="unit-row"
      data-unit-id={unit.id}
      data-status={unit.status}
      className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{unit.title}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{unit.id}</span>
          <span aria-hidden="true"> · </span>
          oracle: {unit.oracle}
          {unit.deps.length > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              deps: {unit.deps.join(", ")}
            </>
          )}
        </p>
        {unit.note && (
          <p className="text-xs text-destructive">{unit.note}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {unit.pr && (
          <span className="font-mono text-xs text-muted-foreground">
            {unit.pr}
          </span>
        )}
        <StatusBadge status={unit.status} />
      </div>
    </li>
  );
}

const SUMMARY_META: { status: UnitStatus; icon: typeof Layers }[] = [
  { status: "backlog", icon: Layers },
  { status: "active", icon: Activity },
  { status: "merged", icon: GitMerge },
  { status: "blocked", icon: AlertTriangle },
];

export function OpsPage() {
  const counts = countByStatus(opsSnapshot);
  const percent = progressPercent(opsSnapshot);
  const perMilestone = milestoneProgress(opsSnapshot);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">Ops cockpit</h1>
          <a
            href="#/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Build progress</CardTitle>
            <CardDescription>
              Generation {opsSnapshot.generation} · phase {opsSnapshot.phase} ·
              heartbeat{" "}
              <time dateTime={opsSnapshot.heartbeat}>
                {opsSnapshot.heartbeat}
              </time>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {counts.merged} of {counts.total} units merged
                </span>
                <span
                  data-testid="progress-percent"
                  className="font-semibold tabular-nums"
                >
                  {percent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall build progress"
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUMMARY_META.map(({ status, icon: Icon }) => (
                <div
                  key={status}
                  data-testid={`summary-${status}`}
                  className="rounded-lg border border-border p-3"
                >
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {statusLabel(status)}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {counts[status]}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          {STATUS_ORDER.map((status) => {
            const units = unitsByStatus(opsSnapshot, status);
            return (
              <Card
                key={status}
                data-testid={`column-${status}`}
                className="flex min-w-0 flex-col"
              >
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">
                    {statusLabel(status)}
                  </CardTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {units.length}
                  </span>
                </CardHeader>
                <CardContent>
                  {units.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No units.
                    </p>
                  ) : (
                    <ul>
                      {units.map((unit) => (
                        <UnitRow key={unit.id} unit={unit} />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              Per-milestone merge progress across the backlog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {perMilestone.map(({ milestone, counts: mc, percent: mp }) => (
              <div
                key={milestone.id}
                data-testid={`milestone-${milestone.id}`}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    <span className="font-mono text-muted-foreground">
                      {milestone.id}
                    </span>{" "}
                    {milestone.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {mc.merged}/{mc.total} · {mp}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={mp}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${milestone.id} progress`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${mp}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default OpsPage;
