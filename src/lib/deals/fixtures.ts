import { Contact } from "./contact";
import { Deal } from "./deal";
import { Interaction } from "./interaction";
import { Pipeline, PipelineStage } from "./pipeline-stage";

/**
 * Deterministic, offline fixtures for the deal / pipeline model. These are
 * parsed through the schemas in tests so the fixtures themselves are checked,
 * and reused by downstream UI/selector tests as known-good sample data.
 *
 * All data here is fictional and illustrative — it represents a family
 * evaluating prospective acquisitions, never a real transaction.
 */

export const stageSourced: PipelineStage = PipelineStage.parse({
  id: "stage-sourced",
  name: "Sourced",
  order: 0,
  kind: "open",
  probability: 0.1,
});

export const stageDiligence: PipelineStage = PipelineStage.parse({
  id: "stage-diligence",
  name: "Due diligence",
  order: 1,
  kind: "open",
  probability: 0.5,
});

export const stageNegotiation: PipelineStage = PipelineStage.parse({
  id: "stage-negotiation",
  name: "Negotiation",
  order: 2,
  kind: "open",
  probability: 0.8,
});

export const stageWon: PipelineStage = PipelineStage.parse({
  id: "stage-won",
  name: "Closed — acquired",
  order: 3,
  kind: "won",
  probability: 1,
});

export const stageLost: PipelineStage = PipelineStage.parse({
  id: "stage-lost",
  name: "Closed — passed",
  order: 4,
  kind: "lost",
  probability: 0,
});

export const samplePipeline: Pipeline = Pipeline.parse({
  id: "pipeline-direct-pe",
  name: "Direct private equity",
  stages: [
    stageSourced,
    stageDiligence,
    stageNegotiation,
    stageWon,
    stageLost,
  ],
});

export const contactBroker: Contact = Contact.parse({
  id: "contact-broker",
  name: "Jane Doe",
  role: "broker",
  organization: "Evergreen Advisory",
  email: "Jane.Doe@Example.com",
});

export const contactPrincipal: Contact = Contact.parse({
  id: "contact-principal",
  name: "Karl Nieminen",
  role: "principal",
  organization: "Nieminen Forestry Oy",
  phone: "+358 40 123 4567",
});

export const interactionIntro: Interaction = Interaction.parse({
  id: "int-intro",
  kind: "email",
  occurredAt: "2026-01-12T09:30:00Z",
  summary: "Intro from broker",
  direction: "inbound",
  contactIds: ["contact-broker"],
});

export const interactionCall: Interaction = Interaction.parse({
  id: "int-call",
  kind: "call",
  occurredAt: "2026-01-20T14:00:00Z",
  summary: "Intro call with principal",
  direction: "outbound",
  contactIds: ["contact-principal", "contact-broker"],
});

export const sampleDeal: Deal = Deal.parse({
  id: "deal-acorn",
  name: "Project Acorn — forestry roll-up",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-diligence",
  status: "active",
  assetClass: "forest",
  amount: { amount: "4500000.00", currency: "EUR" },
  probability: 0.55,
  openedOn: "2026-01-10",
  expectedCloseOn: "2026-09-30",
  contacts: [contactBroker, contactPrincipal],
  interactions: [interactionIntro, interactionCall],
  tags: ["forestry", "nordics"],
  note: "Roll-up of three family-owned forestry plots in central Finland.",
});

/** A second contact set + deal sitting in the Sourced stage. */
export const contactIntroducer: Contact = Contact.parse({
  id: "contact-introducer",
  name: "Mara Lindqvist",
  role: "introducer",
  organization: "Lindqvist Family Office",
});

export const dealHarbor: Deal = Deal.parse({
  id: "deal-harbor",
  name: "Project Harbor — marina operator",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-sourced",
  status: "active",
  assetClass: "pe",
  amount: { amount: "2200000.00", currency: "EUR" },
  openedOn: "2026-02-02",
  expectedCloseOn: "2026-12-15",
  contacts: [contactIntroducer],
  interactions: [
    Interaction.parse({
      id: "harbor-intro",
      kind: "note",
      occurredAt: "2026-02-02T08:00:00Z",
      summary: "Sourced via family-office introduction",
      contactIds: ["contact-introducer"],
    }),
  ],
  tags: ["leisure", "nordics"],
});

/** A deal deep in negotiation, with a per-deal probability override. */
export const dealSummit: Deal = Deal.parse({
  id: "deal-summit",
  name: "Project Summit — alpine hospitality",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-negotiation",
  status: "active",
  assetClass: "pe",
  amount: { amount: "8750000.00", currency: "EUR" },
  probability: 0.7,
  openedOn: "2025-11-18",
  expectedCloseOn: "2026-08-01",
  contacts: [
    Contact.parse({
      id: "summit-broker",
      name: "Luca Conti",
      role: "broker",
      organization: "Alpina Partners",
      email: "luca.conti@example.com",
    }),
  ],
  interactions: [
    Interaction.parse({
      id: "summit-loi",
      kind: "document",
      occurredAt: "2026-03-10T16:00:00Z",
      summary: "Received counter-signed LOI",
      direction: "inbound",
      contactIds: ["summit-broker"],
    }),
  ],
  tags: ["hospitality", "alps"],
});

/** A closed-won deal, for win-rate math. */
export const dealMeadow: Deal = Deal.parse({
  id: "deal-meadow",
  name: "Project Meadow — dairy holding",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-won",
  status: "won",
  assetClass: "pe",
  amount: { amount: "3100000.00", currency: "EUR" },
  openedOn: "2025-06-01",
  expectedCloseOn: "2026-01-20",
  tags: ["agri"],
});

/** A closed-lost deal, for win-rate math. */
export const dealQuarry: Deal = Deal.parse({
  id: "deal-quarry",
  name: "Project Quarry — aggregates",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-lost",
  status: "lost",
  assetClass: "pe",
  amount: { amount: "5400000.00", currency: "EUR" },
  openedOn: "2025-09-12",
  expectedCloseOn: "2026-02-28",
  note: "Passed after diligence surfaced restoration liabilities.",
  tags: ["materials"],
});

export const sampleDeals: Deal[] = [
  sampleDeal,
  dealHarbor,
  dealSummit,
  dealMeadow,
  dealQuarry,
];
