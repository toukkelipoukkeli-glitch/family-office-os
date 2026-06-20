/**
 * Deterministic, offline fixtures for the insurance coverage tracker.
 *
 * A single seeded {@link InsuranceBook} for the Ursin family, pinned by exact
 * literals so any fixture change is a visible, intentional diff. The numbers are
 * hand-chosen so the engine surfaces a realistic mix of findings:
 *
 *   Exposure (USD):
 *     net worth          52,500,000   (liability claims can reach this)
 *     life need          15,000,000   (income replacement + estate liquidity)
 *     property value     22,000,000   (homes, chalet, contents, fine art)
 *     liability exposure 52,500,000   (== net worth at risk to a judgment)
 *
 *   Active cover:
 *     life       12,000,000  → 80% of need        → WARNING (below 90% target)
 *     property   10,000,000  → 45% of value       → CRITICAL (below 50%)
 *     liability   5,000,000
 *     umbrella   50,000,000  → liability tower 55,000,000 vs 52,500,000 NW (OK)
 *
 *   Plus a lapsed jewellery floater (warning) and a deliberately expensive
 *   fine-art rider whose premium exceeds 5% of its sum insured (info).
 *
 * READ-ONLY product: this only describes a hypothetical insurance book.
 */

import { Money } from "@/lib/money";

import type { InsuranceBook } from "./insurance";

const usd = (amount: string) => Money.of(amount, "USD");

/** The seeded Ursin family insurance book (base USD). */
export const seededInsuranceBook: InsuranceBook = {
  id: "insurance-ursin-2026",
  name: "Ursin Family — 2026 insurance book",
  currency: "USD",
  exposure: {
    netWorth: usd("52500000"),
    lifeNeed: usd("15000000"),
    propertyValue: usd("22000000"),
    liabilityExposure: usd("52500000"),
  },
  policies: [
    // ---- Life ----------------------------------------------------------
    {
      id: "life-term-touko",
      name: "Term life — Touko",
      carrier: "Helvetia Life",
      kind: "life",
      status: "active",
      coverage: usd("8000000"),
      annualPremium: usd("24000"),
      renewalDate: "2027-03-01",
      note: "20-year level term, income replacement.",
    },
    {
      id: "life-perm-touko",
      name: "Whole life — Touko",
      carrier: "Zurich",
      kind: "life",
      status: "active",
      coverage: usd("4000000"),
      annualPremium: usd("52000"),
      renewalDate: "2027-01-15",
      note: "Permanent cover for estate liquidity.",
    },
    // ---- Property & casualty ------------------------------------------
    {
      id: "pc-homeowners",
      name: "Homeowners — primary residence",
      carrier: "Chubb",
      kind: "property",
      status: "active",
      coverage: usd("7000000"),
      annualPremium: usd("31000"),
      deductible: usd("50000"),
      renewalDate: "2026-09-01",
      note: "Dwelling + contents, primary residence.",
    },
    {
      id: "pc-chalet",
      name: "Chalet — secondary home",
      carrier: "AXA",
      kind: "property",
      status: "active",
      coverage: usd("3000000"),
      annualPremium: usd("18000"),
      deductible: usd("25000"),
      renewalDate: "2026-12-01",
      note: "Alpine chalet, all-risk.",
    },
    {
      id: "pc-jewellery-floater",
      name: "Jewellery & valuables floater",
      carrier: "AIG Private Client",
      kind: "property",
      status: "lapsed",
      coverage: usd("1500000"),
      annualPremium: usd("9000"),
      renewalDate: "2026-04-01",
      note: "Lapsed at last renewal — needs rebinding.",
    },
    {
      id: "pc-fine-art-rider",
      name: "Fine-art scheduled rider",
      carrier: "AIG Private Client",
      kind: "property",
      status: "active",
      coverage: usd("250000"),
      annualPremium: usd("18000"),
      deductible: usd("0"),
      renewalDate: "2026-10-15",
      note: "Scheduled museum-grade pieces — high rate.",
    },
    // ---- Liability -----------------------------------------------------
    {
      id: "liab-personal",
      name: "Personal liability",
      carrier: "Chubb",
      kind: "liability",
      status: "active",
      coverage: usd("5000000"),
      annualPremium: usd("6000"),
      renewalDate: "2026-09-01",
      note: "Base personal liability on homeowners.",
    },
    {
      id: "liab-doffi-pending",
      name: "Directors & officers (family foundation)",
      carrier: "Beazley",
      kind: "liability",
      status: "pending",
      coverage: usd("3000000"),
      annualPremium: usd("14000"),
      renewalDate: "2026-08-01",
      note: "Quote bound, awaiting first payment.",
    },
    // ---- Umbrella ------------------------------------------------------
    {
      id: "umb-excess",
      name: "Personal excess (umbrella)",
      carrier: "Chubb",
      kind: "umbrella",
      status: "active",
      coverage: usd("50000000"),
      annualPremium: usd("38000"),
      renewalDate: "2026-09-01",
      note: "Excess liability over the primary tower.",
    },
  ],
};
