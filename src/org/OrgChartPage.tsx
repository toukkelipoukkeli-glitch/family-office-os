import * as React from "react";
import { Building2, Network } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  countNodes,
  buildOrgForest,
  effectiveOwnership,
  entityKindLabel,
  maxDepth,
  ORG_FIXTURE,
  rootEntities,
  type Entity,
} from "@/lib/org";

import { OrgTree } from "./OrgTree";
import { formatNav, formatPct, kindColor } from "./org-format";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-testid="org-stat"
      className="rounded-lg border border-border p-3"
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Look-through ownership of `entity` by each root, shown in the detail panel. */
function LookThrough({
  entities,
  entity,
}: {
  entities: readonly Entity[];
  entity: Entity;
}) {
  const roots = rootEntities(entities);
  const rows = roots
    // A root owns itself trivially; only show *upstream* owners.
    .filter((root) => root.id !== entity.id)
    .map((root) => ({
      root,
      pct: effectiveOwnership(entities, root.id, entity.id),
    }))
    .filter((r) => r.pct > 0);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This entity is a top-level root (no upstream owner).
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="lookthrough-list">
      {rows.map(({ root, pct }) => (
        <li
          key={root.id}
          data-testid="lookthrough-row"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="min-w-0 truncate">{root.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {formatPct(pct)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OrgChartPage() {
  const entities = ORG_FIXTURE;
  const forest = React.useMemo(() => buildOrgForest(entities), [entities]);
  const total = countNodes(forest);
  const depth = maxDepth(forest);
  const roots = rootEntities(entities);

  // Default selection: the first root.
  const [selectedId, setSelectedId] = React.useState<string>(
    roots[0]?.id ?? entities[0]?.id ?? "",
  );
  const selected =
    entities.find((e) => e.id === selectedId) ?? entities[0] ?? null;

  const nav = selected ? formatNav(selected.nav) : null;

  return (
    <AppShell
      title={
        <>
          <Network className="size-5" aria-hidden="true" />
          Org hierarchy
        </>
      }
      titleClassName="flex items-center gap-2"
      backTestId="org-back"
      mainClassName="space-y-6"
    >
        <Card>
          <CardHeader>
            <CardTitle>Legal-entity structure</CardTitle>
            <CardDescription>
              Holding companies, operating subsidiaries, funds and SPVs wired by
              ownership. Click a node to see its look-through ownership.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Entities" value={String(total)} />
              <StatTile label="Roots" value={String(roots.length)} />
              <StatTile label="Tree depth" value={String(depth)} />
              <StatTile
                label="Kinds"
                value={String(new Set(entities.map((e) => e.kind)).size)}
              />
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subsidiary tree</CardTitle>
              <CardDescription>
                Edge labels show each ownership stake.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrgTree
                entities={entities}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </CardContent>
          </Card>

          <Card data-testid="org-detail">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4" aria-hidden="true" />
                {selected ? selected.name : "Select an entity"}
              </CardTitle>
              {selected && (
                <CardDescription>
                  <span
                    className="inline-flex items-center gap-1.5"
                    data-testid="detail-kind"
                  >
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: kindColor(selected.kind) }}
                      aria-hidden="true"
                    />
                    {entityKindLabel(selected.kind)}
                  </span>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selected && (
                <>
                  <dl className="space-y-2 text-sm">
                    {selected.jurisdiction && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Jurisdiction</dt>
                        <dd
                          className="text-right"
                          data-testid="detail-jurisdiction"
                        >
                          {selected.jurisdiction}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">NAV</dt>
                      <dd
                        className="text-right tabular-nums"
                        data-testid="detail-nav"
                      >
                        {nav ?? "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Look-through ownership
                    </p>
                    <LookThrough entities={entities} entity={selected} />
                  </div>

                  {selected.note && (
                    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                      {selected.note}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
    </AppShell>
  );
}

export default OrgChartPage;
