import { describe, expect, it } from "vitest";

import { Company } from "../company/company";
import { Person } from "../company/person";
import { Deal } from "../deals/deal";
import {
  relationshipCompanies,
  relationshipDeals,
  relationshipPeople,
  sampleRelationshipGraph,
  ventureDeal,
} from "./fixtures";
import { layoutRelationshipGraph } from "./layout";
import {
  buildRelationshipGraph,
  countNodeKinds,
  neighbors,
  nodeDegrees,
  nodeId,
} from "./relationship-graph";

describe("nodeId", () => {
  it("namespaces ids by kind so they never collide across domains", () => {
    expect(nodeId("person", "x")).toBe("person:x");
    expect(nodeId("company", "x")).toBe("company:x");
    expect(nodeId("person", "x")).not.toBe(nodeId("company", "x"));
  });
});

describe("buildRelationshipGraph", () => {
  it("is deterministic: same input yields identical output", () => {
    const input = {
      people: relationshipPeople,
      companies: relationshipCompanies,
      deals: relationshipDeals,
    };
    const a = buildRelationshipGraph(input);
    const b = buildRelationshipGraph(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("creates a node per person, company, deal and contact", () => {
    const counts = countNodeKinds(sampleRelationshipGraph);
    expect(counts.person).toBe(3); // Touko, Maria, Ilmari
    expect(counts.company).toBe(4); // topco, real estate, ventures, opco
    expect(counts.deal).toBe(2); // Acorn, Aurora
    // Acorn has 2 contacts, Aurora has 3.
    expect(counts.contact).toBe(5);
  });

  it("emits an ownership edge for every owner stake with the percentage label", () => {
    const owns = sampleRelationshipGraph.edges.filter((e) => e.kind === "owns");
    // topco has two owners (Touko 60%, Maria 40%).
    const toukoEdge = owns.find((e) => e.id === "owns:stake-touko-topco");
    expect(toukoEdge).toBeDefined();
    expect(toukoEdge?.source).toBe("person:person-touko");
    expect(toukoEdge?.target).toBe("company:co-topco");
    expect(toukoEdge?.label).toBe("60%");
  });

  it("emits subsidiary edges between companies", () => {
    const subs = sampleRelationshipGraph.edges.filter(
      (e) => e.kind === "subsidiary",
    );
    const ids = subs.map((e) => e.id);
    expect(ids).toContain("subsidiary:sub-realestate");
    expect(ids).toContain("subsidiary:sub-ventures");
    expect(ids).toContain("subsidiary:sub-opco");
    const re = subs.find((e) => e.id === "subsidiary:sub-realestate");
    expect(re?.source).toBe("company:co-topco");
    expect(re?.target).toBe("company:co-realestate");
    expect(re?.label).toBe("100%");
  });

  it("links contacts to their deal and marks the introducer specially", () => {
    const intro = sampleRelationshipGraph.edges.find(
      (e) => e.id === "deal_contact:deal-aurora:contact-introducer",
    );
    expect(intro?.kind).toBe("introduced");
    expect(intro?.target).toBe("deal:deal-aurora");

    const founder = sampleRelationshipGraph.edges.find(
      (e) => e.id === "deal_contact:deal-aurora:contact-founder-aurora",
    );
    expect(founder?.kind).toBe("deal_contact");
    expect(founder?.label).toBe("principal");
  });

  it("never produces a dangling edge: every endpoint resolves to a node", () => {
    const ids = new Set(sampleRelationshipGraph.nodes.map((n) => n.id));
    for (const e of sampleRelationshipGraph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("materialises a missing owner referenced by a stake", () => {
    const orphanCo = Company.parse({
      id: "co-orphan",
      name: "Orphan Oy",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [
        { id: "s1", ownerType: "person", ownerId: "ghost", percentage: "100" },
      ],
    });
    const g = buildRelationshipGraph({ companies: [orphanCo] });
    const ghost = g.nodes.find((n) => n.id === "person:ghost");
    expect(ghost).toBeDefined();
    expect(ghost?.kind).toBe("person");
    // The edge resolves to the materialised node (not dangling).
    const edge = g.edges.find((e) => e.kind === "owns");
    expect(edge?.source).toBe("person:ghost");
  });

  it("deduplicates nodes when the same person owns several companies", () => {
    const p = Person.parse({ id: "p1", name: "Owner" });
    const a = Company.parse({
      id: "a",
      name: "A",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [{ id: "sa", ownerType: "person", ownerId: "p1", percentage: "50" }],
    });
    const b = Company.parse({
      id: "b",
      name: "B",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [{ id: "sb", ownerType: "person", ownerId: "p1", percentage: "50" }],
    });
    const g = buildRelationshipGraph({ people: [p], companies: [a, b] });
    expect(g.nodes.filter((n) => n.id === "person:p1")).toHaveLength(1);
    expect(g.edges.filter((e) => e.kind === "owns")).toHaveLength(2);
  });

  it("handles empty input", () => {
    const g = buildRelationshipGraph({});
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(countNodeKinds(g)).toEqual({
      person: 0,
      company: 0,
      contact: 0,
      deal: 0,
    });
  });

  it("orders nodes people-then-companies-then-deals/contacts", () => {
    const kinds = sampleRelationshipGraph.nodes.map((n) => n.kind);
    const firstCompany = kinds.indexOf("company");
    const firstDeal = kinds.indexOf("deal");
    const lastPerson = kinds.lastIndexOf("person");
    expect(lastPerson).toBeLessThan(firstCompany);
    expect(firstCompany).toBeLessThan(firstDeal);
  });
});

describe("nodeDegrees / neighbors", () => {
  it("counts incident edges per node", () => {
    const deg = nodeDegrees(sampleRelationshipGraph);
    // topco: owned by Touko + Maria (2) and owns realestate + ventures (2) = 4.
    expect(deg.get("company:co-topco")).toBe(4);
    // A leaf person with one stake has degree 1 (Maria owns only topco).
    expect(deg.get("person:person-maria")).toBe(1);
  });

  it("lists the neighbourhood of a node without duplicates", () => {
    const nbrs = neighbors(sampleRelationshipGraph, "company:co-topco");
    expect(nbrs).toContain("person:person-touko");
    expect(nbrs).toContain("person:person-maria");
    expect(nbrs).toContain("company:co-realestate");
    expect(nbrs).toContain("company:co-ventures");
    expect(new Set(nbrs).size).toBe(nbrs.length);
  });

  it("returns an empty neighbourhood for an isolated node", () => {
    const p = Person.parse({ id: "lonely", name: "Lonely" });
    const g = buildRelationshipGraph({ people: [p] });
    expect(neighbors(g, "person:lonely")).toEqual([]);
    expect(nodeDegrees(g).get("person:lonely")).toBe(0);
  });
});

describe("layoutRelationshipGraph", () => {
  it("positions every node inside the viewport", () => {
    const layout = layoutRelationshipGraph(sampleRelationshipGraph, {
      width: 720,
      height: 560,
    });
    expect(layout.nodes).toHaveLength(sampleRelationshipGraph.nodes.length);
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(720);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(560);
    }
  });

  it("resolves every edge to the coordinates of its endpoints", () => {
    const layout = layoutRelationshipGraph(sampleRelationshipGraph);
    const pos = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(layout.edges).toHaveLength(sampleRelationshipGraph.edges.length);
    for (const e of layout.edges) {
      const a = pos.get(e.source)!;
      const b = pos.get(e.target)!;
      expect(e.x1).toBe(a.x);
      expect(e.y1).toBe(a.y);
      expect(e.x2).toBe(b.x);
      expect(e.y2).toBe(b.y);
    }
  });

  it("is deterministic and byte-stable across runs", () => {
    const a = layoutRelationshipGraph(sampleRelationshipGraph);
    const b = layoutRelationshipGraph(sampleRelationshipGraph);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("places a single innermost node dead centre", () => {
    const c = Company.parse({
      id: "solo",
      name: "Solo",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
    });
    const g = buildRelationshipGraph({ companies: [c] });
    const layout = layoutRelationshipGraph(g, { width: 400, height: 400 });
    expect(layout.nodes[0].x).toBe(200);
    expect(layout.nodes[0].y).toBe(200);
  });

  it("skips edges whose endpoints are absent from the layout", () => {
    // Hand-craft a graph with a dangling edge (defensive path).
    const layout = layoutRelationshipGraph({
      nodes: [
        {
          id: "company:a",
          sourceId: "a",
          kind: "company",
          label: "A",
        },
      ],
      edges: [
        { id: "e", source: "company:a", target: "company:missing", kind: "owns" },
      ],
    });
    expect(layout.edges).toHaveLength(0);
  });
});

describe("fixtures validity", () => {
  it("ventureDeal parses through the Deal schema", () => {
    expect(Deal.safeParse(ventureDeal).success).toBe(true);
  });

  it("all relationship fixtures parse through their schemas", () => {
    relationshipPeople.forEach((p) =>
      expect(Person.safeParse(p).success).toBe(true),
    );
    relationshipCompanies.forEach((c) =>
      expect(Company.safeParse(c).success).toBe(true),
    );
    relationshipDeals.forEach((d) =>
      expect(Deal.safeParse(d).success).toBe(true),
    );
  });
});
