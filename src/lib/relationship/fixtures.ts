import { Company } from "../company/company";
import { Person } from "../company/person";
import {
  personMaria,
  personTouko,
  realEstateCo,
  topco,
  venturesCo,
  opCo,
} from "../company/fixtures";
import { Deal } from "../deals/deal";
import { sampleDeal } from "../deals/fixtures";
import { buildRelationshipGraph } from "./relationship-graph";

/**
 * Deterministic, offline fixtures for the founder / investor relationship
 * graph. Everything here is fictional and reuses the validated company/people
 * and deal fixtures, then layers on a second deal whose contacts are explicit
 * founders and investors so the graph shows the "founder/investor" angle the
 * unit is about.
 *
 * No live API calls — these are parsed through the domain schemas in tests so
 * the fixtures themselves stay valid.
 */

/** A venture founder the family is backing. */
export const personIlmari: Person = Person.parse({
  id: "person-ilmari",
  name: "Ilmari Laine",
  countryOfResidence: "FI",
  note: "Founder",
  tags: ["founder"],
});

/**
 * A second deal: a venture investment whose contacts span a founder, a lead
 * co-investor, and an introducer — the founder/investor relationships at the
 * heart of this unit.
 */
export const ventureDeal: Deal = Deal.parse({
  id: "deal-aurora",
  name: "Aurora Robotics — Series A",
  pipelineId: "pipeline-direct-pe",
  stageId: "stage-negotiation",
  status: "active",
  assetClass: "pe",
  amount: { amount: "2000000.00", currency: "EUR" },
  probability: 0.7,
  openedOn: "2026-02-01",
  expectedCloseOn: "2026-07-15",
  contacts: [
    {
      id: "contact-founder-aurora",
      name: "Ilmari Laine",
      role: "principal",
      organization: "Aurora Robotics Oy",
      note: "Founder & CEO",
    },
    {
      id: "contact-coinvestor",
      name: "Nordic Growth Fund II",
      role: "other",
      organization: "Nordic Growth Partners",
      note: "Lead co-investor",
    },
    {
      id: "contact-introducer",
      name: "Sara Virtanen",
      role: "introducer",
      organization: "Helsinki Angels",
    },
  ],
  interactions: [],
  tags: ["venture", "robotics"],
  note: "Series A alongside Nordic Growth; family takes a 12% minority stake.",
});

/** All people in the relationship-graph scenario. */
export const relationshipPeople: Person[] = [
  personTouko,
  personMaria,
  personIlmari,
];

/** All companies in the relationship-graph scenario. */
export const relationshipCompanies: Company[] = [
  topco,
  realEstateCo,
  venturesCo,
  opCo,
];

/** All deals in the relationship-graph scenario. */
export const relationshipDeals: Deal[] = [sampleDeal, ventureDeal];

/** The fully-built sample relationship graph used by the UI and tests. */
export const sampleRelationshipGraph = buildRelationshipGraph({
  people: relationshipPeople,
  companies: relationshipCompanies,
  deals: relationshipDeals,
});
