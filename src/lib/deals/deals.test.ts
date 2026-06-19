import { describe, expect, it } from "vitest";

import {
  CONTACT_ROLES,
  Contact,
  ContactRole,
} from "./contact";
import {
  DEAL_STATUSES,
  Deal,
  DealStatus,
  isTerminalDealStatus,
} from "./deal";
import {
  contactBroker,
  contactPrincipal,
  interactionCall,
  sampleDeal,
  samplePipeline,
  stageSourced,
  stageWon,
} from "./fixtures";
import {
  INTERACTION_DIRECTIONS,
  INTERACTION_KINDS,
  Interaction,
  InteractionDirection,
  InteractionKind,
} from "./interaction";
import {
  Pipeline,
  PipelineStage,
  STAGE_KINDS,
  StageKind,
  orderedStages,
} from "./pipeline-stage";

describe("Contact", () => {
  it("parses a valid contact and normalizes email casing/whitespace", () => {
    const c = Contact.parse({
      id: "c1",
      name: " Jane Doe ",
      role: "broker",
      email: " Jane.Doe@Example.COM ",
    });
    expect(c.name).toBe("Jane Doe");
    expect(c.email).toBe("jane.doe@example.com");
  });

  it("accepts every declared contact role", () => {
    for (const role of CONTACT_ROLES) {
      expect(ContactRole.safeParse(role).success).toBe(true);
    }
  });

  it("rejects an unknown role", () => {
    expect(
      Contact.safeParse({ id: "c1", name: "X", role: "ceo" }).success,
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(
      Contact.safeParse({ id: "c1", name: "   ", role: "broker" }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      Contact.safeParse({
        id: "c1",
        name: "X",
        role: "broker",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("accepts a plausible phone and rejects junk", () => {
    expect(
      Contact.safeParse({
        id: "c1",
        name: "X",
        role: "principal",
        phone: "+358 40 123 4567",
      }).success,
    ).toBe(true);
    expect(
      Contact.safeParse({
        id: "c1",
        name: "X",
        role: "principal",
        phone: "call-me",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      Contact.safeParse({
        id: "c1",
        name: "X",
        role: "broker",
        title: "boss",
      }).success,
    ).toBe(false);
  });
});

describe("PipelineStage", () => {
  it("applies defaults for kind and probability", () => {
    const s = PipelineStage.parse({ id: "s", name: "Sourced", order: 0 });
    expect(s.kind).toBe("open");
    expect(s.probability).toBe(0);
  });

  it("accepts every stage kind", () => {
    for (const kind of STAGE_KINDS) {
      expect(StageKind.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects a negative or non-integer order", () => {
    expect(
      PipelineStage.safeParse({ id: "s", name: "X", order: -1 }).success,
    ).toBe(false);
    expect(
      PipelineStage.safeParse({ id: "s", name: "X", order: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects probability outside [0, 1]", () => {
    expect(
      PipelineStage.safeParse({ id: "s", name: "X", order: 0, probability: 1.1 })
        .success,
    ).toBe(false);
    expect(
      PipelineStage.safeParse({
        id: "s",
        name: "X",
        order: 0,
        probability: -0.1,
      }).success,
    ).toBe(false);
  });
});

describe("Pipeline", () => {
  it("parses the sample pipeline", () => {
    expect(samplePipeline.stages).toHaveLength(5);
  });

  it("orderedStages sorts by ascending order", () => {
    const shuffled = Pipeline.parse({
      id: "p",
      name: "P",
      stages: [
        { id: "won", name: "Won", order: 9, kind: "won", probability: 1 },
        { id: "lost", name: "Lost", order: 8, kind: "lost", probability: 0 },
        { id: "a", name: "A", order: 0 },
        { id: "b", name: "B", order: 1 },
      ],
    });
    expect(orderedStages(shuffled).map((s) => s.id)).toEqual([
      "a",
      "b",
      "lost",
      "won",
    ]);
  });

  it("requires at least one stage", () => {
    expect(Pipeline.safeParse({ id: "p", name: "P", stages: [] }).success).toBe(
      false,
    );
  });

  it("rejects duplicate stage ids", () => {
    const res = Pipeline.safeParse({
      id: "p",
      name: "P",
      stages: [
        { id: "dup", name: "A", order: 0 },
        { id: "dup", name: "B", order: 1 },
        { id: "won", name: "W", order: 2, kind: "won", probability: 1 },
        { id: "lost", name: "L", order: 3, kind: "lost" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("duplicate stage id"))).toBe(
        true,
      );
    }
  });

  it("rejects duplicate stage orders", () => {
    const res = Pipeline.safeParse({
      id: "p",
      name: "P",
      stages: [
        { id: "a", name: "A", order: 0 },
        { id: "b", name: "B", order: 0 },
        { id: "won", name: "W", order: 2, kind: "won", probability: 1 },
        { id: "lost", name: "L", order: 3, kind: "lost" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("duplicate stage order")),
      ).toBe(true);
    }
  });

  it("requires exactly one won and one lost terminal stage", () => {
    // zero won/lost
    expect(
      Pipeline.safeParse({
        id: "p",
        name: "P",
        stages: [{ id: "a", name: "A", order: 0 }],
      }).success,
    ).toBe(false);
    // two won stages
    expect(
      Pipeline.safeParse({
        id: "p",
        name: "P",
        stages: [
          { id: "w1", name: "W1", order: 0, kind: "won", probability: 1 },
          { id: "w2", name: "W2", order: 1, kind: "won", probability: 1 },
          { id: "l", name: "L", order: 2, kind: "lost" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("Interaction", () => {
  it("parses a valid interaction and defaults contactIds", () => {
    const it = Interaction.parse({
      id: "i1",
      kind: "note",
      occurredAt: "2026-02-01T10:00:00Z",
      summary: "Saw the deck",
    });
    expect(it.contactIds).toEqual([]);
  });

  it("accepts every kind and direction", () => {
    for (const k of INTERACTION_KINDS) {
      expect(InteractionKind.safeParse(k).success).toBe(true);
    }
    for (const d of INTERACTION_DIRECTIONS) {
      expect(InteractionDirection.safeParse(d).success).toBe(true);
    }
  });

  it("rejects a non-ISO timestamp", () => {
    expect(
      Interaction.safeParse({
        id: "i1",
        kind: "call",
        occurredAt: "2026-02-01 10:00:00",
        summary: "X",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(
      Interaction.safeParse({
        id: "i1",
        kind: "call",
        occurredAt: "2026-02-01T10:00:00Z",
        summary: "",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate contact ids within an interaction", () => {
    const res = Interaction.safeParse({
      id: "i1",
      kind: "meeting",
      occurredAt: "2026-02-01T10:00:00Z",
      summary: "X",
      contactIds: ["a", "a"],
    });
    expect(res.success).toBe(false);
  });
});

describe("Deal", () => {
  it("parses the sample deal and applies status default", () => {
    expect(sampleDeal.status).toBe("active");
    expect(sampleDeal.contacts).toHaveLength(2);
    expect(sampleDeal.interactions).toHaveLength(2);
  });

  it("defaults status to active when omitted", () => {
    const d = Deal.parse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
    });
    expect(d.status).toBe("active");
    expect(d.contacts).toEqual([]);
    expect(d.interactions).toEqual([]);
    expect(d.tags).toEqual([]);
  });

  it("accepts every declared status", () => {
    for (const s of DEAL_STATUSES) {
      expect(DealStatus.safeParse(s).success).toBe(true);
    }
  });

  it("rejects probability outside [0, 1]", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
        probability: 2,
      }).success,
    ).toBe(false);
  });

  it("rejects a negative deal amount via NonNegativeMoneySchema", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
        amount: { amount: "-1", currency: "EUR" },
      }).success,
    ).toBe(false);
  });

  it("normalizes currency on the amount", () => {
    const d = Deal.parse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      amount: { amount: "100", currency: "eur" },
    });
    expect(d.amount?.currency).toBe("EUR");
  });

  it("rejects an interaction referencing an unknown contact id", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [contactBroker],
      interactions: [
        {
          id: "i1",
          kind: "call",
          occurredAt: "2026-01-02T10:00:00Z",
          summary: "X",
          contactIds: ["contact-principal"],
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) =>
          i.message.includes("unknown contact id"),
        ),
      ).toBe(true);
    }
  });

  it("accepts an interaction that references a contact on the deal", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [contactBroker, contactPrincipal],
      interactions: [interactionCall],
    });
    expect(res.success).toBe(true);
  });

  it("rejects duplicate contact ids on the deal", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [contactBroker, { ...contactBroker }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects duplicate interaction ids on the deal", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [contactBroker],
      interactions: [
        {
          id: "dup",
          kind: "note",
          occurredAt: "2026-01-02T10:00:00Z",
          summary: "A",
        },
        {
          id: "dup",
          kind: "note",
          occurredAt: "2026-01-03T10:00:00Z",
          summary: "B",
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects expectedCloseOn before openedOn", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-06-01",
      expectedCloseOn: "2026-05-01",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("must not be before")),
      ).toBe(true);
    }
  });

  it("rejects an invalid calendar openedOn date", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
        owner: "me",
      }).success,
    ).toBe(false);
  });
});

describe("Deal — adversarial edge cases", () => {
  it("accepts expectedCloseOn equal to openedOn (same-day close)", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-06-01",
      expectedCloseOn: "2026-06-01",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an interaction referencing a contact when the deal has none", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      interactions: [
        {
          id: "i1",
          kind: "note",
          occurredAt: "2026-01-02T10:00:00Z",
          summary: "X",
          contactIds: ["nobody"],
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message.includes("unknown contact id")),
      ).toBe(true);
    }
  });

  it("accepts distinct interactions that share the same valid contact", () => {
    const res = Deal.safeParse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      contacts: [contactBroker],
      interactions: [
        {
          id: "i1",
          kind: "call",
          occurredAt: "2026-01-02T10:00:00Z",
          summary: "First",
          contactIds: [contactBroker.id],
        },
        {
          id: "i2",
          kind: "email",
          occurredAt: "2026-01-03T10:00:00Z",
          summary: "Second",
          contactIds: [contactBroker.id],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty deal name even with surrounding whitespace", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "   ",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty-string tag", () => {
    expect(
      Deal.safeParse({
        id: "d",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
        tags: ["ok", "  "],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(
      Deal.safeParse({
        id: "",
        name: "D",
        pipelineId: "p",
        stageId: "s",
        openedOn: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("accepts a zero-amount opportunity (free / nominal)", () => {
    const d = Deal.parse({
      id: "d",
      name: "D",
      pipelineId: "p",
      stageId: "s",
      openedOn: "2026-01-01",
      amount: { amount: "0", currency: "USD" },
    });
    expect(d.amount?.amount).toBe("0");
  });

  it("accepts probability at both inclusive bounds", () => {
    for (const p of [0, 1]) {
      expect(
        Deal.safeParse({
          id: "d",
          name: "D",
          pipelineId: "p",
          stageId: "s",
          openedOn: "2026-01-01",
          probability: p,
        }).success,
      ).toBe(true);
    }
  });
});

describe("orderedStages — purity", () => {
  it("does not mutate the input pipeline's stages array", () => {
    const before = samplePipeline.stages.map((s) => s.id);
    const sorted = orderedStages(samplePipeline);
    expect(samplePipeline.stages.map((s) => s.id)).toEqual(before);
    // returns a new array, not the same reference
    expect(sorted).not.toBe(samplePipeline.stages);
  });
});

describe("Pipeline — additional terminal-stage cases", () => {
  it("rejects a pipeline missing a lost stage", () => {
    expect(
      Pipeline.safeParse({
        id: "p",
        name: "P",
        stages: [
          { id: "a", name: "A", order: 0 },
          { id: "w", name: "W", order: 1, kind: "won", probability: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects two lost stages", () => {
    expect(
      Pipeline.safeParse({
        id: "p",
        name: "P",
        stages: [
          { id: "w", name: "W", order: 0, kind: "won", probability: 1 },
          { id: "l1", name: "L1", order: 1, kind: "lost" },
          { id: "l2", name: "L2", order: 2, kind: "lost" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("isTerminalDealStatus", () => {
  it("classifies terminal vs active statuses", () => {
    expect(isTerminalDealStatus("active")).toBe(false);
    expect(isTerminalDealStatus("won")).toBe(true);
    expect(isTerminalDealStatus("lost")).toBe(true);
    expect(isTerminalDealStatus("abandoned")).toBe(true);
  });
});

describe("fixtures round-trip through their schemas", () => {
  it("re-parses fixtures without loss", () => {
    expect(Deal.parse(sampleDeal)).toEqual(sampleDeal);
    expect(Pipeline.parse(samplePipeline)).toEqual(samplePipeline);
    expect(PipelineStage.parse(stageSourced)).toEqual(stageSourced);
    expect(PipelineStage.parse(stageWon)).toEqual(stageWon);
    expect(Contact.parse(contactBroker)).toEqual(contactBroker);
  });
});
