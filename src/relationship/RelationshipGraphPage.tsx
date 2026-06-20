import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sampleRelationshipGraph } from "@/lib/relationship/fixtures";
import {
  countNodeKinds,
  neighbors,
  nodeDegrees,
  type RelationshipGraphData,
  type RelationshipNodeKind,
} from "@/lib/relationship/relationship-graph";

import { KIND_COLOR, KIND_LABEL } from "./kind-style";
import { RelationshipGraph } from "./RelationshipGraph";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";

const KIND_ORDER: RelationshipNodeKind[] = [
  "company",
  "person",
  "deal",
  "contact",
];

function LegendSwatch({ kind }: { kind: RelationshipNodeKind }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="legend-item"
      data-kind={kind}
    >
      <span
        aria-hidden="true"
        className="inline-block size-3 rounded-full"
        style={{ backgroundColor: KIND_COLOR[kind] }}
      />
      {KIND_LABEL[kind]}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-4 py-3"
      data-testid="stat-card"
      data-stat={label}
    >
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export interface RelationshipGraphViewProps {
  graph?: RelationshipGraphData;
}

/**
 * The interactive relationship-graph view: stats, legend, the SVG graph itself,
 * and a detail panel for the selected node. Exported separately from the routed
 * page so it can be unit-tested without app chrome.
 */
export function RelationshipGraphView({
  graph = sampleRelationshipGraph,
}: RelationshipGraphViewProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const counts = React.useMemo(() => countNodeKinds(graph), [graph]);
  const degrees = React.useMemo(() => nodeDegrees(graph), [graph]);
  const selectedNode = selectedId
    ? graph.nodes.find((n) => n.id === selectedId)
    : undefined;
  const selectedNeighbors = selectedId
    ? neighbors(graph, selectedId)
        .map((id) => graph.nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
    : [];

  return (
    <section data-testid="relationship-view" className="space-y-6">
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="relationship-stats"
      >
        <StatCard label="People" value={counts.person} />
        <StatCard label="Entities" value={counts.company} />
        <StatCard label="Deals" value={counts.deal} />
        <StatCard label="Founders / investors" value={counts.contact} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Relationship graph</CardTitle>
            <CardDescription>
              Family principals, the entities they own, and the founders and
              investors behind each deal. Tap a node to trace its connections.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pb-4">
              {KIND_ORDER.map((kind) => (
                <LegendSwatch key={kind} kind={kind} />
              ))}
            </div>
            <div className="overflow-x-auto">
              <RelationshipGraph
                graph={graph}
                selectedId={selectedId}
                onSelect={(id) =>
                  setSelectedId((prev) => (prev === id ? null : id))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="detail-panel">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedNode ? selectedNode.label : "Details"}
            </CardTitle>
            <CardDescription>
              {selectedNode
                ? (selectedNode.sublabel ?? KIND_LABEL[selectedNode.kind])
                : "Select a node in the graph to see who it is connected to."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-3">
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="detail-degree"
                >
                  {degrees.get(selectedNode.id) ?? 0} direct connection
                  {(degrees.get(selectedNode.id) ?? 0) === 1 ? "" : "s"}
                </p>
                <ul className="space-y-2" data-testid="detail-neighbors">
                  {selectedNeighbors.map((n) => (
                    <li
                      key={n.id}
                      data-testid="detail-neighbor"
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: KIND_COLOR[n.kind] }}
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{n.label}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {KIND_LABEL[n.kind]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing selected yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/**
 * Full-page wrapper around {@link RelationshipGraphView} with app chrome and
 * back navigation. Routed at `#/relationships` and exercised by the Playwright
 * visual check at desktop and mobile viewports.
 */
export function RelationshipGraphPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Relationship graph
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "relationship-graph",
                ["id", "sourceId", "kind", "label", "sublabel"],
                sampleRelationshipGraph.nodes.map((n) => [
                  n.id,
                  n.sourceId,
                  n.kind,
                  n.label,
                  n.sublabel ?? null,
                ]),
                {
                  nodes: sampleRelationshipGraph.nodes,
                  edges: sampleRelationshipGraph.edges,
                },
              )}
              testId="relationships-export"
            />
            <a
              href="#/"
              data-testid="relationships-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
          A read-only map of the family&apos;s founder and investor network,
          built from the ownership and deal-pipeline fixtures. It never contacts
          anyone — it only shows who is connected to whom.
        </p>
        <RelationshipGraphView />
      </main>
    </div>
  );
}

export default RelationshipGraphPage;
