import { describe, expect, it } from "vitest";

import { Company, EntityType, Subsidiary } from "./company";
import {
  opCo,
  personMaria,
  personTouko,
  realEstateCo,
  sampleCompanies,
  stakeToukoTopco,
  topco,
  venturesCo,
} from "./fixtures";
import { OwnershipGraph } from "./ownership-graph";
import {
  OwnerType,
  OwnershipStake,
  Percentage,
  ShareClass,
} from "./ownership-stake";
import { Person } from "./person";

describe("Person", () => {
  it("parses a full person and normalizes country casing", () => {
    const p = Person.parse({
      id: "p1",
      name: "  Jane Doe ",
      dateOfBirth: "1990-01-02",
      countryOfResidence: "us",
      email: "jane@example.com",
    });
    expect(p.name).toBe("Jane Doe");
    expect(p.countryOfResidence).toBe("US");
    expect(p.tags).toEqual([]);
  });

  it("requires a non-empty name and a valid id", () => {
    expect(Person.safeParse({ id: "p1", name: "   " }).success).toBe(false);
    expect(Person.safeParse({ id: "", name: "x" }).success).toBe(false);
  });

  it("rejects malformed country, email, and date", () => {
    expect(
      Person.safeParse({ id: "p", name: "n", countryOfResidence: "USA" })
        .success,
    ).toBe(false);
    expect(
      Person.safeParse({ id: "p", name: "n", email: "not-an-email" }).success,
    ).toBe(false);
    expect(
      Person.safeParse({ id: "p", name: "n", dateOfBirth: "2021-02-30" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      Person.safeParse({ id: "p", name: "n", nickname: "x" }).success,
    ).toBe(false);
  });
});

describe("Percentage", () => {
  it("accepts non-negative decimals in [0, 100]", () => {
    expect(Percentage.parse("0")).toBe("0");
    expect(Percentage.parse("37.5")).toBe("37.5");
    expect(Percentage.parse("100")).toBe("100");
  });

  it("rejects values above 100, negatives, and junk", () => {
    expect(Percentage.safeParse("100.0001").success).toBe(false);
    expect(Percentage.safeParse("-1").success).toBe(false);
    expect(Percentage.safeParse("abc").success).toBe(false);
    expect(Percentage.safeParse("").success).toBe(false);
  });
});

describe("OwnershipStake", () => {
  it("parses and defaults shareClass to common", () => {
    const s = OwnershipStake.parse({
      id: "s1",
      ownerType: "person",
      ownerId: "p1",
      percentage: "10",
    });
    expect(s.shareClass).toBe("common");
    expect(s.votingPercentage).toBeUndefined();
  });

  it("supports a company owner and a divergent voting percentage", () => {
    const s = OwnershipStake.parse({
      id: "s2",
      ownerType: "company",
      ownerId: "co-x",
      percentage: "30",
      shareClass: "non_voting",
      votingPercentage: "0",
    });
    expect(s.ownerType).toBe("company");
    expect(s.votingPercentage).toBe("0");
  });

  it("rejects invalid owner type / share class enums", () => {
    expect(OwnerType.safeParse("robot").success).toBe(false);
    expect(ShareClass.safeParse("golden").success).toBe(false);
    expect(
      OwnershipStake.safeParse({
        id: "s",
        ownerType: "trust",
        ownerId: "x",
        percentage: "1",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      OwnershipStake.safeParse({
        id: "s",
        ownerType: "person",
        ownerId: "p",
        percentage: "1",
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("Subsidiary", () => {
  it("parses a minimal subsidiary edge", () => {
    const sub = Subsidiary.parse({
      id: "e1",
      companyId: "co-child",
      percentage: "55",
    });
    expect(sub.companyId).toBe("co-child");
    expect(sub.since).toBeUndefined();
  });

  it("rejects an invalid since date and unknown keys", () => {
    expect(
      Subsidiary.safeParse({
        id: "e",
        companyId: "c",
        percentage: "1",
        since: "2020-13-01",
      }).success,
    ).toBe(false);
    expect(
      Subsidiary.safeParse({
        id: "e",
        companyId: "c",
        percentage: "1",
        foo: 1,
      }).success,
    ).toBe(false);
  });
});

describe("EntityType", () => {
  it("accepts known forms and rejects unknown", () => {
    expect(EntityType.parse("llc")).toBe("llc");
    expect(EntityType.safeParse("s-corp").success).toBe(false);
  });
});

describe("Company", () => {
  it("parses the topco fixture and applies defaults", () => {
    expect(topco.owners).toHaveLength(2);
    expect(topco.subsidiaries).toHaveLength(2);
    expect(realEstateCo.owners).toEqual([]);
    expect(realEstateCo.subsidiaries).toEqual([]);
    expect(realEstateCo.tags).toEqual([]);
  });

  it("normalizes jurisdiction and currency casing", () => {
    const c = Company.parse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "gb",
      currency: "gbp",
    });
    expect(c.jurisdiction).toBe("GB");
    expect(c.currency).toBe("GBP");
  });

  it("rejects an invalid jurisdiction code", () => {
    expect(
      Company.safeParse({
        id: "c",
        name: "X",
        entityType: "corporation",
        jurisdiction: "Finland",
        currency: "EUR",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate owner stake ids", () => {
    const res = Company.safeParse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [
        { id: "dup", ownerType: "person", ownerId: "p1", percentage: "10" },
        { id: "dup", ownerType: "person", ownerId: "p2", percentage: "10" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("duplicate"))).toBe(
        true,
      );
    }
  });

  it("rejects duplicate subsidiary ids", () => {
    const res = Company.safeParse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [
        { id: "dup", companyId: "a", percentage: "10" },
        { id: "dup", companyId: "b", percentage: "10" },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects total ownership exceeding 100%", () => {
    const res = Company.safeParse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [
        { id: "a", ownerType: "person", ownerId: "p1", percentage: "60" },
        { id: "b", ownerType: "person", ownerId: "p2", percentage: "50" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("exceeds 100%")),
      ).toBe(true);
    }
  });

  it("accepts total ownership of exactly 100%", () => {
    const res = Company.safeParse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      owners: [
        { id: "a", ownerType: "person", ownerId: "p1", percentage: "33.33" },
        { id: "b", ownerType: "person", ownerId: "p2", percentage: "33.33" },
        { id: "d", ownerType: "person", ownerId: "p3", percentage: "33.34" },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a company listed as its own subsidiary", () => {
    const res = Company.safeParse({
      id: "self",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "e", companyId: "self", percentage: "100" }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("its own subsidiary")),
      ).toBe(true);
    }
  });

  it("rejects a combined stake in one child exceeding 100%", () => {
    const res = Company.safeParse({
      id: "c",
      name: "X",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [
        { id: "e1", companyId: "child", percentage: "60" },
        { id: "e2", companyId: "child", percentage: "60" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("exceeds 100%")),
      ).toBe(true);
    }
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      Company.safeParse({
        id: "c",
        name: "X",
        entityType: "corporation",
        jurisdiction: "FI",
        currency: "EUR",
        revenue: 100,
      }).success,
    ).toBe(false);
  });
});

describe("OwnershipGraph", () => {
  const graph = OwnershipGraph.from(sampleCompanies);

  it("builds from validated companies and exposes ids", () => {
    expect(graph.ids().sort()).toEqual(
      ["co-opco", "co-realestate", "co-topco", "co-ventures"].sort(),
    );
    expect(graph.get("co-topco")?.name).toBe("Ursin Holdings Oy");
    expect(graph.get("missing")).toBeUndefined();
  });

  it("throws on duplicate company ids", () => {
    expect(() => OwnershipGraph.from([topco, topco])).toThrow(/duplicate/);
  });

  it("throws when a node fails schema validation", () => {
    expect(() => OwnershipGraph.from([{ id: "bad" }])).toThrow();
  });

  it("reports direct stakes", () => {
    expect(graph.directStake("co-topco", "co-realestate")).toBe(100);
    expect(graph.directStake("co-topco", "co-ventures")).toBe(75);
    expect(graph.directStake("co-topco", "co-opco")).toBe(0);
    expect(graph.directStake("missing", "co-opco")).toBe(0);
  });

  it("computes effective look-through ownership", () => {
    expect(graph.effectiveOwnership("co-topco", "co-topco")).toBe(100);
    expect(graph.effectiveOwnership("co-topco", "co-realestate")).toBe(100);
    expect(graph.effectiveOwnership("co-topco", "co-ventures")).toBe(75);
    // 75% * 50% = 37.5%
    expect(graph.effectiveOwnership("co-topco", "co-opco")).toBeCloseTo(37.5, 9);
    // ventures -> opco directly
    expect(graph.effectiveOwnership("co-ventures", "co-opco")).toBe(50);
    // leaf owns nothing
    expect(graph.effectiveOwnership("co-realestate", "co-opco")).toBe(0);
  });

  it("sums effective ownership across multiple paths", () => {
    // Diamond: root owns A (50%) and B (50%); both own target (100% each).
    const root = Company.parse({
      id: "root",
      name: "Root",
      entityType: "holding_company",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [
        { id: "ra", companyId: "a", percentage: "50" },
        { id: "rb", companyId: "b", percentage: "50" },
      ],
    });
    const a = Company.parse({
      id: "a",
      name: "A",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "at", companyId: "t", percentage: "100" }],
    });
    const b = Company.parse({
      id: "b",
      name: "B",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "bt", companyId: "t", percentage: "100" }],
    });
    const t = Company.parse({
      id: "t",
      name: "T",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
    });
    const g = OwnershipGraph.from([root, a, b, t]);
    // 50% + 50% = 100%
    expect(g.effectiveOwnership("root", "t")).toBeCloseTo(100, 9);
  });

  it("terminates on a cyclic graph instead of looping forever", () => {
    // a -> b -> a cycle; ask for ownership of an unrelated target.
    const a = Company.parse({
      id: "a",
      name: "A",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "ab", companyId: "b", percentage: "50" }],
    });
    const b = Company.parse({
      id: "b",
      name: "B",
      entityType: "corporation",
      jurisdiction: "FI",
      currency: "EUR",
      subsidiaries: [{ id: "ba", companyId: "a", percentage: "50" }],
    });
    const g = OwnershipGraph.from([a, b]);
    expect(g.effectiveOwnership("a", "missing")).toBe(0);
    // a effectively owns 50% of b directly (the cycle back to a is cut).
    expect(g.effectiveOwnership("a", "b")).toBe(50);
  });
});

describe("fixtures sanity", () => {
  it("exposes valid people and companies", () => {
    expect(Person.safeParse(personTouko).success).toBe(true);
    expect(Person.safeParse(personMaria).success).toBe(true);
    expect(Company.safeParse(topco).success).toBe(true);
    expect(Company.safeParse(venturesCo).success).toBe(true);
    expect(Company.safeParse(opCo).success).toBe(true);
    expect(stakeToukoTopco.percentage).toBe("60");
  });
});
