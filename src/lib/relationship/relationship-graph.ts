import type { Company } from "../company/company";
import type { Person } from "../company/person";
import type { Deal } from "../deals/deal";

/**
 * Founder / investor relationship graph.
 *
 * A read-only, deterministic projection that unifies three existing data
 * domains into a single people-and-entities graph the family can eyeball:
 *
 *  - {@link Person} records (family members, beneficiaries, directors);
 *  - {@link Company} records and the ownership/subsidiary edges between them;
 *  - {@link Deal} records and the {@link Contact}s (founders, investors,
 *    brokers, advisors) attached to each deal.
 *
 * Nothing here moves money, places a trade, or contacts anyone — it only reads
 * existing fixtures/state and derives nodes and edges for display and analysis.
 */

/** The kind of party a node represents. Drives colour/shape in the UI. */
export type RelationshipNodeKind = "person" | "company" | "contact" | "deal";

/** A vertex in the relationship graph. */
export interface RelationshipNode {
  /** Stable id. Namespaced by kind so ids never collide across domains. */
  id: string;
  /** Original domain id (un-namespaced), useful for cross-referencing. */
  sourceId: string;
  kind: RelationshipNodeKind;
  /** Display label (person/company/contact name, or deal name). */
  label: string;
  /**
   * Optional secondary label (e.g. a contact's role, a company's entity type,
   * a deal's status). Shown smaller in the UI.
   */
  sublabel?: string;
}

/** The semantic kind of an edge. */
export type RelationshipEdgeKind =
  /** A person or company owns a stake in a company. */
  | "owns"
  /** A company holds a subsidiary interest in another company. */
  | "subsidiary"
  /** A contact is attached to a deal. */
  | "deal_contact"
  /** A contact introduced a deal (role === "introducer"). */
  | "introduced";

/** A directed edge between two nodes. */
export interface RelationshipEdge {
  id: string;
  /** Node id the edge points *from* (the owner / parent / contact). */
  source: string;
  /** Node id the edge points *to* (the owned / child / deal). */
  target: string;
  kind: RelationshipEdgeKind;
  /** Optional human-readable label (e.g. "60%", "broker"). */
  label?: string;
}

/** The materialised graph: deduplicated nodes plus the edges between them. */
export interface RelationshipGraphData {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

/** Inputs the graph is projected from. All optional; missing = empty. */
export interface RelationshipGraphInput {
  people?: readonly Person[];
  companies?: readonly Company[];
  deals?: readonly Deal[];
}

/** Namespaced node id for a domain entity, so ids never collide across kinds. */
export function nodeId(kind: RelationshipNodeKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

const ENTITY_TYPE_LABELS: Record<Company["entityType"], string> = {
  corporation: "Corporation",
  llc: "LLC",
  partnership: "Partnership",
  trust: "Trust",
  foundation: "Foundation",
  holding_company: "Holding company",
  fund: "Fund",
  other: "Entity",
};

/**
 * Build the relationship graph from the supplied domain records.
 *
 * Pure and deterministic: the same input always yields the same nodes and
 * edges, in a stable order (people, then companies, then deals/contacts, with
 * edges following their source nodes). Owner/contact references to entities not
 * present in the input are materialised as lightweight nodes so no edge ever
 * dangles, keeping the projection self-consistent for rendering.
 */
export function buildRelationshipGraph(
  input: RelationshipGraphInput,
): RelationshipGraphData {
  const people = input.people ?? [];
  const companies = input.companies ?? [];
  const deals = input.deals ?? [];

  const nodes: RelationshipNode[] = [];
  const edges: RelationshipEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  const addNode = (node: RelationshipNode) => {
    if (seenNodes.has(node.id)) return;
    seenNodes.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge: RelationshipEdge) => {
    if (seenEdges.has(edge.id)) return;
    seenEdges.add(edge.id);
    edges.push(edge);
  };

  // --- People -------------------------------------------------------------
  for (const p of people) {
    addNode({
      id: nodeId("person", p.id),
      sourceId: p.id,
      kind: "person",
      label: p.name,
      sublabel: p.note ?? "Person",
    });
  }

  // --- Companies (nodes first, so owner/subsidiary edges resolve cleanly) --
  for (const c of companies) {
    addNode({
      id: nodeId("company", c.id),
      sourceId: c.id,
      kind: "company",
      label: c.name,
      sublabel: ENTITY_TYPE_LABELS[c.entityType],
    });
  }

  // --- Ownership + subsidiary edges --------------------------------------
  for (const c of companies) {
    const companyNode = nodeId("company", c.id);

    for (const stake of c.owners) {
      const ownerKind: RelationshipNodeKind =
        stake.ownerType === "person" ? "person" : "company";
      const ownerNode = nodeId(ownerKind, stake.ownerId);
      // Materialise the owner if it wasn't supplied, so the edge never dangles.
      if (!seenNodes.has(ownerNode)) {
        addNode({
          id: ownerNode,
          sourceId: stake.ownerId,
          kind: ownerKind,
          label: stake.ownerId,
          sublabel: ownerKind === "person" ? "Person" : "Entity",
        });
      }
      addEdge({
        id: `owns:${stake.id}`,
        source: ownerNode,
        target: companyNode,
        kind: "owns",
        label: `${stake.percentage}%`,
      });
    }

    for (const sub of c.subsidiaries) {
      const childNode = nodeId("company", sub.companyId);
      if (!seenNodes.has(childNode)) {
        addNode({
          id: childNode,
          sourceId: sub.companyId,
          kind: "company",
          label: sub.companyId,
          sublabel: "Entity",
        });
      }
      addEdge({
        id: `subsidiary:${sub.id}`,
        source: companyNode,
        target: childNode,
        kind: "subsidiary",
        label: `${sub.percentage}%`,
      });
    }
  }

  // --- Deals + their contacts --------------------------------------------
  for (const d of deals) {
    const dealNode = nodeId("deal", d.id);
    addNode({
      id: dealNode,
      sourceId: d.id,
      kind: "deal",
      label: d.name,
      sublabel: `Deal · ${d.status}`,
    });

    for (const contact of d.contacts) {
      const contactNode = nodeId("contact", contact.id);
      addNode({
        id: contactNode,
        sourceId: contact.id,
        kind: "contact",
        label: contact.name,
        sublabel: contact.organization
          ? `${contact.role} · ${contact.organization}`
          : contact.role,
      });
      addEdge({
        id: `deal_contact:${d.id}:${contact.id}`,
        source: contactNode,
        target: dealNode,
        kind: contact.role === "introducer" ? "introduced" : "deal_contact",
        label: contact.role,
      });
    }
  }

  return { nodes, edges };
}

/** Count nodes of each kind in a built graph. Useful for headline stats. */
export function countNodeKinds(
  graph: RelationshipGraphData,
): Record<RelationshipNodeKind, number> {
  const counts: Record<RelationshipNodeKind, number> = {
    person: 0,
    company: 0,
    contact: 0,
    deal: 0,
  };
  for (const n of graph.nodes) counts[n.kind] += 1;
  return counts;
}

/**
 * The degree (number of incident edges) of each node, keyed by node id. A node
 * with no edges still appears with degree 0.
 */
export function nodeDegrees(
  graph: RelationshipGraphData,
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const n of graph.nodes) degrees.set(n.id, 0);
  for (const e of graph.edges) {
    degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
  }
  return degrees;
}

/**
 * The ids of nodes directly connected to `nodeId` by any edge (its
 * neighbourhood), in a stable, de-duplicated order.
 */
export function neighbors(
  graph: RelationshipGraphData,
  id: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of graph.edges) {
    let other: string | undefined;
    if (e.source === id) other = e.target;
    else if (e.target === id) other = e.source;
    if (other && !seen.has(other)) {
      seen.add(other);
      out.push(other);
    }
  }
  return out;
}
