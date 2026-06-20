import { Entity, type EntityList } from "../org/entity";

import { EntityHoldings, type HoldingsList } from "./exposure";

/**
 * Deterministic fixture for the look-through demo. Reuses a small family-office
 * structure and tags each entity with direct holdings, so the consolidation
 * engine and the charted view can be exercised offline.
 *
 * Structure (all USD):
 *
 *   Ravenscroft Family Trust (root, 100%)
 *    └─ Ravenscroft Holdings LLC                  (cash buffer)
 *        ├─ 100% Meridian Operating Co            (equity + cash)
 *        │        └─ 80%  Meridian Logistics SPV  (real estate)
 *        ├─ 60%  Harbor Real Estate Fund          (real estate)
 *        │        └─ 100% Pier 9 Property SPV      (real estate)
 *        ├─ 75%  Aurora Ventures LLC              (private equity)
 *        │        └─ 50%  Aurora Climate SPV      (private equity + crypto)
 *        └─ 40%  Beacon Fixed-Income Fund         (fixed income)
 */
const RAW_ENTITIES = [
  {
    id: "trust",
    name: "Ravenscroft Family Trust",
    kind: "trust",
    jurisdiction: "South Dakota, US",
  },
  {
    id: "holdco",
    name: "Ravenscroft Holdings LLC",
    kind: "holding",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "trust", ownershipPct: 1 }],
  },
  {
    id: "meridian",
    name: "Meridian Operating Co",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 1 }],
  },
  {
    id: "meridian-spv",
    name: "Meridian Logistics SPV",
    kind: "spv",
    jurisdiction: "Wyoming, US",
    owners: [{ parentId: "meridian", ownershipPct: 0.8 }],
  },
  {
    id: "harbor",
    name: "Harbor Real Estate Fund",
    kind: "fund",
    jurisdiction: "Cayman Islands",
    owners: [{ parentId: "holdco", ownershipPct: 0.6 }],
  },
  {
    id: "pier9",
    name: "Pier 9 Property SPV",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "harbor", ownershipPct: 1 }],
  },
  {
    id: "aurora",
    name: "Aurora Ventures LLC",
    kind: "operating",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "holdco", ownershipPct: 0.75 }],
  },
  {
    id: "aurora-climate",
    name: "Aurora Climate SPV",
    kind: "spv",
    jurisdiction: "Delaware, US",
    owners: [{ parentId: "aurora", ownershipPct: 0.5 }],
  },
  {
    id: "beacon",
    name: "Beacon Fixed-Income Fund",
    kind: "fund",
    jurisdiction: "Luxembourg",
    owners: [{ parentId: "holdco", ownershipPct: 0.4 }],
  },
] as const;

/** Parsed, validated fixture org-hierarchy for the look-through demo. */
export const LOOKTHROUGH_ENTITIES: EntityList = RAW_ENTITIES.map((e) =>
  Entity.parse(e),
);

const usd = (amount: string) => ({ amount, currency: "USD" });

const RAW_HOLDINGS = [
  {
    entityId: "holdco",
    holdings: [
      { assetClass: "cash", value: usd("1500000"), label: "Operating cash" },
    ],
  },
  {
    entityId: "meridian",
    holdings: [
      { assetClass: "equity", value: usd("9000000"), label: "Listed equities" },
      { assetClass: "cash", value: usd("1000000"), label: "Working capital" },
    ],
  },
  {
    entityId: "meridian-spv",
    holdings: [
      {
        assetClass: "real_estate",
        value: usd("2500000"),
        label: "Distribution centre",
      },
    ],
  },
  {
    entityId: "harbor",
    holdings: [
      {
        assetClass: "real_estate",
        value: usd("8000000"),
        label: "Core property book",
      },
    ],
  },
  {
    entityId: "pier9",
    holdings: [
      {
        assetClass: "real_estate",
        value: usd("6800000"),
        label: "Waterfront development",
      },
    ],
  },
  {
    entityId: "aurora",
    holdings: [
      {
        assetClass: "private_equity",
        value: usd("5200000"),
        label: "Venture portfolio",
      },
    ],
  },
  {
    entityId: "aurora-climate",
    holdings: [
      {
        assetClass: "private_equity",
        value: usd("1500000"),
        label: "Climate-tech stakes",
      },
      { assetClass: "crypto", value: usd("400000"), label: "Token treasury" },
    ],
  },
  {
    entityId: "beacon",
    holdings: [
      {
        assetClass: "fixed_income",
        value: usd("12000000"),
        label: "Investment-grade credit",
      },
    ],
  },
] as const;

/** Parsed, validated fixture holdings keyed to {@link LOOKTHROUGH_ENTITIES}. */
export const LOOKTHROUGH_HOLDINGS: HoldingsList = RAW_HOLDINGS.map((h) =>
  EntityHoldings.parse(h),
);

/** The root entity id used by the demo view. */
export const LOOKTHROUGH_ROOT_ID = "trust";
