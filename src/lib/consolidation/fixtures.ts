import { Entity, type EntityList } from "../org/entity";

import type { IntercompanyInvestment } from "./consolidate";

/**
 * Deterministic fixture family-office structure for the consolidation view.
 * Offline only; drives the unit + Playwright visual checks.
 *
 * Structure (effective ownership of the trust root in parentheses):
 *
 *   Sinclair Family Trust (root, 100%)
 *    └─ 100% Sinclair Holdings LLC          (100%)
 *        ├─ 100% Atlas Operating Co          (100%)
 *        │        └─ 80% Atlas Logistics SPV (80%)
 *        ├─ 60%  Beacon Real Estate Fund     (60%)
 *        │        └─ 100% Pier 12 Property    (60%)
 *        └─ 75%  Cobalt Ventures LLC          (75%)
 *                 └─ 50% Cobalt Climate SPV   (37.5%)
 *
 * Standalone NAV is each entity's *own* direct assets. The holdco / opco /
 * fund layers also carry intercompany investments — the book value of the
 * stakes they hold in the entities below them — which must be eliminated so the
 * underlying assets are not double-counted.
 */
const RAW_ENTITIES = [
  {
    id: "trust",
    name: "Sinclair Family Trust",
    kind: "trust",
    jurisdiction: "South Dakota, US",
    nav: { amount: "1500000", currency: "USD" },
    note: "Top of the structure; holds cash + the holdco stake.",
  },
  {
    id: "holdco",
    name: "Sinclair Holdings LLC",
    kind: "holding",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "trust", ownershipPct: 1 }],
    nav: { amount: "3000000", currency: "USD" },
  },
  {
    id: "atlas",
    name: "Atlas Operating Co",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 1 }],
    nav: { amount: "9000000", currency: "USD" },
  },
  {
    id: "atlas-spv",
    name: "Atlas Logistics SPV",
    kind: "spv",
    jurisdiction: "Wyoming, US",
    owners: [{ parentId: "atlas", ownershipPct: 0.8 }],
    nav: { amount: "2500000", currency: "USD" },
  },
  {
    id: "beacon",
    name: "Beacon Real Estate Fund",
    kind: "fund",
    jurisdiction: "Cayman Islands",
    owners: [{ parentId: "holdco", ownershipPct: 0.6 }],
    nav: { amount: "16000000", currency: "USD" },
  },
  {
    id: "pier12",
    name: "Pier 12 Property",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "beacon", ownershipPct: 1 }],
    nav: { amount: "7000000", currency: "USD" },
  },
  {
    id: "cobalt",
    name: "Cobalt Ventures LLC",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 0.75 }],
    nav: { amount: "5000000", currency: "USD" },
  },
  {
    id: "cobalt-spv",
    name: "Cobalt Climate SPV",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "cobalt", ownershipPct: 0.5 }],
    nav: { amount: "2000000", currency: "USD" },
  },
] as const;

/** Parsed, validated fixture entity list for consolidation. */
export const CONSOLIDATION_ENTITIES: EntityList = RAW_ENTITIES.map((e) =>
  Entity.parse(e),
);

/** Reporting root for the fixture (the family trust). */
export const CONSOLIDATION_ROOT_ID = "trust";

/**
 * Intercompany investments to eliminate: the carrying value each upper-layer
 * entity records for its stake in the layer below. These values are part of
 * the holders' standalone NAVs and represent the *same* underlying assets, so
 * consolidation removes them.
 */
export const CONSOLIDATION_INTERCOMPANY: IntercompanyInvestment[] = [
  // Trust's stake in the holdco.
  {
    holderId: "trust",
    investeeId: "holdco",
    value: { amount: "1200000", currency: "USD" },
  },
  // Holdco's stakes in the three sub-entities.
  {
    holderId: "holdco",
    investeeId: "atlas",
    value: { amount: "1800000", currency: "USD" },
  },
  {
    holderId: "holdco",
    investeeId: "beacon",
    value: { amount: "900000", currency: "USD" },
  },
  {
    holderId: "holdco",
    investeeId: "cobalt",
    value: { amount: "600000", currency: "USD" },
  },
  // Atlas opco's stake in its SPV.
  {
    holderId: "atlas",
    investeeId: "atlas-spv",
    value: { amount: "400000", currency: "USD" },
  },
];
