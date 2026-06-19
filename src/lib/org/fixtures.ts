import { Entity, type EntityList } from "./entity";

/**
 * Deterministic fixture org-hierarchy for a fictional family office. Used by
 * the org-chart view and by the unit / Playwright visual checks. No live data.
 *
 * Structure:
 *
 *   Vandermeer Family Trust (root)
 *    └─ 100% Vandermeer Holdings LLC
 *        ├─ 100% Meridian Operating Co
 *        │        └─ 80% Meridian Logistics SPV
 *        ├─ 60%  Harbor Real Estate Fund
 *        │        └─ 100% Pier 9 Property SPV
 *        └─ 75%  Aurora Ventures LLC
 *                 └─ 50% Aurora Climate SPV
 */
const RAW_ENTITIES = [
  {
    id: "trust",
    name: "Vandermeer Family Trust",
    kind: "trust",
    jurisdiction: "South Dakota, US",
    nav: { amount: "0", currency: "USD" },
    note: "Top of the structure; settlor-directed.",
  },
  {
    id: "holdco",
    name: "Vandermeer Holdings LLC",
    kind: "holding",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "trust", ownershipPct: 1 }],
    nav: { amount: "4200000", currency: "USD" },
  },
  {
    id: "meridian",
    name: "Meridian Operating Co",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 1 }],
    nav: { amount: "9100000", currency: "USD" },
  },
  {
    id: "meridian-spv",
    name: "Meridian Logistics SPV",
    kind: "spv",
    jurisdiction: "Wyoming, US",
    owners: [{ parentId: "meridian", ownershipPct: 0.8 }],
    nav: { amount: "2300000", currency: "USD" },
  },
  {
    id: "harbor",
    name: "Harbor Real Estate Fund",
    kind: "fund",
    jurisdiction: "Cayman Islands",
    owners: [{ parentId: "holdco", ownershipPct: 0.6 }],
    nav: { amount: "15400000", currency: "USD" },
  },
  {
    id: "pier9",
    name: "Pier 9 Property SPV",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "harbor", ownershipPct: 1 }],
    nav: { amount: "6800000", currency: "USD" },
  },
  {
    id: "aurora",
    name: "Aurora Ventures LLC",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 0.75 }],
    nav: { amount: "5200000", currency: "USD" },
  },
  {
    id: "aurora-climate",
    name: "Aurora Climate SPV",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "aurora", ownershipPct: 0.5 }],
    nav: { amount: "1900000", currency: "USD" },
  },
] as const;

/** Parsed, validated fixture entity list. */
export const ORG_FIXTURE: EntityList = RAW_ENTITIES.map((e) => Entity.parse(e));
