import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OwnershipGraph, type Company } from "@/lib/company";
import { crossHoldingCompanies } from "@/lib/company/fixtures";

import { entityTypeLabel } from "./entity-type-label";
import { OwnershipNetwork } from "./ownership-network";

/** Format a percentage for display, trimming trailing zeros. */
function pct(value: number): string {
  return `${Number(value.toFixed(4))}%`;
}

interface OwnershipDetailProps {
  graph: OwnershipGraph;
  rootId: string;
  selectedId: string;
}

/**
 * Side panel describing the selected company: its direct owners (other nodes
 * holding it) and its effective look-through ownership from the chosen root.
 */
function OwnershipDetail({ graph, rootId, selectedId }: OwnershipDetailProps) {
  const company = graph.get(selectedId);
  if (!company) return null;

  // Direct parents: any node listing this company as a subsidiary.
  const parents = graph
    .ids()
    .map((id) => ({ id, stake: graph.directStake(id, selectedId) }))
    .filter((p) => p.stake > 0);

  const effective = graph.effectiveOwnership(rootId, selectedId);
  const rootName = graph.get(rootId)?.name ?? rootId;

  return (
    <div className="space-y-4" data-testid="ownership-detail">
      <div>
        <h3 className="text-base font-semibold" data-testid="detail-name">
          {company.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {entityTypeLabel(company.entityType)} · {company.jurisdiction} ·{" "}
          {company.currency}
        </p>
      </div>

      <div
        className="rounded-lg border border-border p-3"
        data-testid="detail-effective"
      >
        <p className="text-xs text-muted-foreground">
          Effective ownership from {rootName}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{pct(effective)}</p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Direct owners
        </p>
        {parents.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="detail-no-owners">
            None in this group (top-level entity).
          </p>
        ) : (
          <ul className="space-y-1" data-testid="detail-owners">
            {parents.map((p) => (
              <li
                key={p.id}
                data-testid="detail-owner"
                data-owner-id={p.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate">{graph.get(p.id)?.name ?? p.id}</span>
                <span className="tabular-nums font-medium">{pct(p.stake)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface OwnershipGraphViewProps {
  companies?: Company[];
  /** Id of the entity to measure effective ownership from. Defaults to the first root. */
  rootId?: string;
}

/**
 * Interactive ownership-network view: the {@link OwnershipNetwork} graph plus a
 * detail panel that updates as the user selects nodes. Pure and deterministic;
 * fed by offline fixtures by default.
 */
export function OwnershipGraphView({
  companies = crossHoldingCompanies,
  rootId,
}: OwnershipGraphViewProps) {
  const graph = React.useMemo(() => OwnershipGraph.from(companies), [companies]);

  const effectiveRoot = React.useMemo(() => {
    if (rootId && graph.get(rootId)) return rootId;
    // Default root = first node nobody owns (id-sorted for determinism).
    const ids = [...graph.ids()].sort();
    const owned = new Set<string>();
    for (const id of ids) {
      for (const sub of graph.get(id)?.subsidiaries ?? []) {
        if (graph.get(sub.companyId)) owned.add(sub.companyId);
      }
    }
    return ids.find((id) => !owned.has(id)) ?? ids[0];
  }, [graph, rootId]);

  const [selectedId, setSelectedId] = React.useState<string>(effectiveRoot);

  React.useEffect(() => {
    setSelectedId(effectiveRoot);
  }, [effectiveRoot]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <Card data-testid="ownership-graph-card" className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Ownership network</CardTitle>
          <CardDescription>
            Cross-holding structure. Click an entity to inspect its owners and
            look-through ownership.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <OwnershipNetwork
              companies={graph}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Selected entity</CardDescription>
        </CardHeader>
        <CardContent>
          <OwnershipDetail
            graph={graph}
            rootId={effectiveRoot}
            selectedId={selectedId}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Full-page wrapper around {@link OwnershipGraphView} with app chrome and back
 * navigation. Routed at `#/ownership` and exercised by the Playwright visual
 * check at desktop and mobile viewports.
 */
export function OwnershipGraphPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Ownership graph
          </h1>
          <a
            href="#/"
            data-testid="ownership-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="mb-8 text-sm text-muted-foreground">
          Cross-holding ownership network for the family group, rendered from
          deterministic fixtures.
        </p>
        <OwnershipGraphView />
      </main>
    </div>
  );
}

export default OwnershipGraphPage;
