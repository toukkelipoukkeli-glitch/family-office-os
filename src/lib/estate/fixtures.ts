/**
 * Deterministic, offline fixtures for the estate & succession planner.
 *
 * A single seeded {@link EstatePlan} for the Ursin family, pinned by exact
 * literals so a fixture change is a visible, intentional diff. Every number is
 * hand-chosen so the engine's outputs are easy to reason about in tests:
 *
 *   Gross estate (USD):
 *     cash        bank + money-market          = 4,500,000
 *     marketable  equity book + ETFs           = 12,000,000
 *     illiquid    operating co + forest + art  = 38,000,000
 *     ---------------------------------------------------------------
 *     total gross                              = 54,500,000
 *
 *   Liabilities: chalet mortgage 2,000,000.
 *   Admin cost: 1.5% of gross = 817,500.
 *   Exemption: 13,610,000.  Marginal death-tax rate: 40%.
 *
 * Spouse takes a 25,000,000 marital (tax-free) legacy; the two children split
 * the residue; the family foundation takes a fixed 1,000,000 (charitable,
 * tax-free). These produce a meaningful taxable estate AND a deliberate
 * liquidity squeeze (liquid assets are dwarfed by the illiquid operating
 * company), which is exactly the situation the planner exists to surface.
 *
 * READ-ONLY product: this only describes a hypothetical succession.
 */

import { Money } from "@/lib/money";

import type { EstatePlan } from "./estate";

const usd = (amount: string) => Money.of(amount, "USD");

/** The seeded Ursin family estate plan (base USD). */
export const seededEstatePlan: EstatePlan = {
  id: "estate-ursin-2026",
  name: "Ursin Family — 2026 succession plan",
  currency: "USD",
  principal: "Touko Ursin",
  entities: [
    { id: "trust", name: "Ursin Family Trust", kind: "trust" },
    { id: "holdco", name: "Ursin Holdings AG", kind: "holdco" },
    { id: "foundation", name: "Ursin Family Foundation", kind: "foundation" },
  ],
  assets: [
    // Cash & equivalents.
    {
      id: "a-bank",
      name: "Operating cash & deposits",
      value: usd("2500000"),
      liquidity: "cash",
    },
    {
      id: "a-mmf",
      name: "Money-market fund",
      value: usd("2000000"),
      liquidity: "cash",
      entityId: "trust",
    },
    // Marketable securities.
    {
      id: "a-equities",
      name: "Global equity book",
      value: usd("8000000"),
      liquidity: "marketable",
      entityId: "trust",
    },
    {
      id: "a-etf",
      name: "Index ETF sleeve",
      value: usd("4000000"),
      liquidity: "marketable",
    },
    // Illiquid / operating.
    {
      id: "a-opco",
      name: "Operating company (60%)",
      value: usd("30000000"),
      liquidity: "illiquid",
      entityId: "holdco",
    },
    {
      id: "a-forest",
      name: "Forest land (5,000 ha)",
      value: usd("6000000"),
      liquidity: "illiquid",
      entityId: "holdco",
    },
    {
      id: "a-art",
      name: "Art & collectibles",
      value: usd("2000000"),
      liquidity: "illiquid",
    },
  ],
  liabilities: [
    { id: "l-mortgage", name: "Chalet mortgage", amount: usd("2000000") },
  ],
  beneficiaries: [
    { id: "spouse", name: "Spouse", relation: "spouse" },
    { id: "child-a", name: "Daughter (Aino)", relation: "child" },
    { id: "child-b", name: "Son (Eero)", relation: "child" },
    { id: "foundation", name: "Family Foundation", relation: "charity" },
  ],
  bequests: [
    // Marital legacy — passes free of estate tax.
    { id: "bq-spouse", beneficiaryId: "spouse", amount: usd("25000000") },
    // Charitable legacy — also tax-free.
    { id: "bq-foundation", beneficiaryId: "foundation", amount: usd("1000000") },
    // Children split the residue 1:1.
    { id: "bq-child-a", beneficiaryId: "child-a", residueShare: 1 },
    { id: "bq-child-b", beneficiaryId: "child-b", residueShare: 1 },
  ],
  exemption: usd("13610000"),
  taxRate: 0.4,
  adminCostRate: 0.015,
};
