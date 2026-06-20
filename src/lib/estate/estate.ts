/**
 * Estate & succession planning model.
 *
 * A family office does not just track what is owned today — it has to plan for
 * the moment of a principal's death: who inherits what, through which
 * **entities** (trusts, holding companies, foundations), what **estate / death
 * tax** falls due, and — the question that actually decides whether the plan
 * survives contact with reality — whether there is enough **liquidity at death**
 * to pay that tax and any debts *without* a forced fire-sale of the illiquid
 * crown jewels (the operating company, the forest, the art).
 *
 * This module is the deterministic engine behind the estate planner. It models:
 *
 *  - an **estate**: a set of assets (each with a value, a liquidity class, and
 *    optionally the entity that holds it), liabilities, the available
 *    estate-tax exemption, and a marginal death-tax rate;
 *  - **bequests**: how the net estate is directed to beneficiaries — either by
 *    a fixed amount or by a share of the residue, with an optional
 *    spousal / charitable marital-style exemption that passes free of tax;
 *  - the **estate-tax calculation**: taxable estate = gross estate − debts −
 *    exempt (marital/charitable) bequests − the lifetime exemption, taxed at the
 *    marginal rate;
 *  - the **liquidity-at-death analysis**: settlement costs (tax + debts +
 *    administration) funded from a liquidity waterfall (cash first, then
 *    marketable, then illiquid at a fire-sale haircut), reporting the coverage
 *    ratio and any shortfall — the headline "do we have a liquidity problem"
 *    number;
 *  - the **entity / succession flow**: how each asset passes from the estate,
 *    through its holding entity, to the beneficiaries — the data behind the
 *    succession Sankey/flow diagram.
 *
 * Everything is pure, deterministic and offline. Money is {@link Money}
 * (Decimal-backed) — never floating-point currency. READ-ONLY product: this
 * *analyzes* a hypothetical succession; it never moves money, retitles an asset,
 * or executes any part of an estate plan.
 */

import { Decimal } from "decimal.js";

import { Money, sumMoney } from "@/lib/money";

/** Thrown when estate-planning inputs are structurally invalid. */
export class EstateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EstateError";
  }
}

/**
 * How quickly an asset could be turned into spendable cash to settle the
 * estate, ordered most-liquid first. The order is also the funding priority:
 * `cash` is tapped before `marketable`, which is tapped before `illiquid`.
 */
export const LIQUIDITY_CLASSES = ["cash", "marketable", "illiquid"] as const;
export type LiquidityClass = (typeof LIQUIDITY_CLASSES)[number];

/** Human-readable labels for each {@link LiquidityClass}. */
export const LIQUIDITY_CLASS_LABELS: Record<LiquidityClass, string> = {
  cash: "Cash & equivalents",
  marketable: "Marketable securities",
  illiquid: "Illiquid / operating",
};

/**
 * Fraction of gross value **lost** when an asset must be sold quickly to fund
 * settlement. Cash realizes its full value; illiquids take a steep fire-sale
 * discount. Exact decimals (strings) — never floats.
 */
export const DEFAULT_LIQUIDITY_HAIRCUTS: Readonly<
  Record<LiquidityClass, string>
> = {
  cash: "0",
  marketable: "0.05",
  illiquid: "0.30",
};

/** The funding priority of a liquidity class (0 = tapped first). */
export function liquidityPriority(cls: LiquidityClass): number {
  return LIQUIDITY_CLASSES.indexOf(cls);
}

/** A holding entity an asset may pass through (trust, holdco, foundation, …). */
export interface EstateEntity {
  /** Stable id, referenced by {@link EstateAsset.entityId}. */
  id: string;
  /** Human-readable name, e.g. "Ursin Family Trust". */
  name: string;
  /** What kind of vehicle this is — affects how the asset passes on death. */
  kind: "individual" | "trust" | "holdco" | "foundation";
}

/** A single asset in the estate. */
export interface EstateAsset {
  /** Stable id. */
  id: string;
  /** Human-readable name, e.g. "Operating company (60%)". */
  name: string;
  /** Gross fair value at death. */
  value: Money;
  /** How quickly it can be turned into cash to settle the estate. */
  liquidity: LiquidityClass;
  /** The entity that holds it (id into {@link EstatePlan.entities}); omitted = held personally. */
  entityId?: string;
}

/** A debt or liability that must be settled out of the estate. */
export interface EstateLiability {
  /** Stable id. */
  id: string;
  /** Human-readable name, e.g. "Mortgage on chalet". */
  name: string;
  /** Outstanding amount. */
  amount: Money;
}

/** A beneficiary who receives part of the estate. */
export interface Beneficiary {
  /** Stable id, referenced by {@link Bequest.beneficiaryId}. */
  id: string;
  /** Human-readable name, e.g. "Spouse", "Daughter", "Family Foundation". */
  name: string;
  /** Relationship class — `spouse` and `charity` bequests pass free of estate tax. */
  relation: "spouse" | "child" | "relative" | "charity" | "other";
}

/**
 * A direction of value to a beneficiary. Exactly one of `amount` or
 * `residueShare` must be set:
 *  - `amount` — a fixed cash legacy taken off the top of the net estate;
 *  - `residueShare` — a relative weight of whatever residue remains after the
 *    fixed legacies (the shares are normalized, so [2, 1] means two-thirds /
 *    one-third).
 */
export interface Bequest {
  /** Stable id. */
  id: string;
  /** Who receives it (id into {@link EstatePlan.beneficiaries}). */
  beneficiaryId: string;
  /** A fixed legacy amount, mutually exclusive with `residueShare`. */
  amount?: Money;
  /** A relative share of the residue, mutually exclusive with `amount`. */
  residueShare?: number;
}

/** A complete estate plan: the input to the engine. */
export interface EstatePlan {
  /** Stable id. */
  id: string;
  /** Human-readable name, e.g. "Ursin Family — 2026 plan". */
  name: string;
  /** Base reporting currency; every Money in the plan must use it. */
  currency: string;
  /** The principal whose death the plan models, e.g. "Touko Ursin". */
  principal: string;
  /** Holding entities assets may pass through. */
  entities: EstateEntity[];
  /** Assets in the estate. */
  assets: EstateAsset[];
  /** Debts to settle. */
  liabilities: EstateLiability[];
  /** Beneficiaries. */
  beneficiaries: Beneficiary[];
  /** How the net estate is directed. */
  bequests: Bequest[];
  /** Lifetime estate-tax exemption (amount that passes free of tax). */
  exemption: Money;
  /** Marginal death-tax rate on the taxable estate, as a fraction (e.g. 0.40). */
  taxRate: number;
  /**
   * Estate-administration cost as a fraction of the gross estate (probate,
   * legal, executor fees). Defaults to 0 when omitted.
   */
  adminCostRate?: number;
}

/** Per-liquidity-class roll-up of the estate. */
export interface LiquidityBucket {
  cls: LiquidityClass;
  label: string;
  /** Gross value in this class. */
  gross: Money;
  /** Haircut fraction applied on a forced sale. */
  haircut: Decimal;
  /** Net proceeds realizable from a forced sale (gross × (1 − haircut)). */
  net: Money;
}

/** One step of the settlement funding waterfall. */
export interface FundingStep {
  cls: LiquidityClass;
  label: string;
  /** Gross value drawn from this class to fund settlement. */
  grossUsed: Money;
  /** Net proceeds those draws realize (after the haircut). */
  netUsed: Money;
}

/** One edge of the entity / succession flow (estate → entity → beneficiary). */
export interface FlowLink {
  source: string;
  target: string;
  value: Money;
}

/** A node in the succession flow graph. */
export interface FlowNode {
  id: string;
  label: string;
  kind: "estate" | "entity" | "beneficiary" | "tax";
}

/** What a single beneficiary nets after estate tax. */
export interface BeneficiaryShare {
  beneficiaryId: string;
  name: string;
  relation: Beneficiary["relation"];
  /** Gross value directed to this beneficiary before their pro-rata tax. */
  gross: Money;
  /** Estate tax allocated to this beneficiary's (non-exempt) share. */
  tax: Money;
  /** What the beneficiary actually receives (gross − tax). */
  net: Money;
}

/** The full result of analyzing an estate plan. */
export interface EstateAnalysis {
  currency: string;
  /** Sum of all asset values. */
  grossEstate: Money;
  /** Sum of all liabilities. */
  totalDebts: Money;
  /** Estate-administration cost (adminCostRate × gross estate). */
  adminCost: Money;
  /** Value passing to spouse/charity, exempt from estate tax. */
  exemptBequests: Money;
  /** Lifetime exemption applied. */
  exemptionApplied: Money;
  /** Estate after debts, admin and exempt bequests but before the lifetime exemption. */
  netEstate: Money;
  /** The base the death-tax rate is applied to (never negative). */
  taxableEstate: Money;
  /** Estate tax due. */
  estateTax: Money;
  /** Total cash the estate must produce at death: tax + debts + admin. */
  settlementNeed: Money;
  /** Net distributable to beneficiaries after settlement: gross − settlementNeed. */
  distributable: Money;
  /** Per-class liquidity roll-up. */
  buckets: LiquidityBucket[];
  /** Net liquidity available without any forced illiquid sale (cash + marketable, after haircut). */
  liquidAvailable: Money;
  /** Net liquidity from everything, illiquids included (the absolute backstop). */
  totalRealizable: Money;
  /** liquidAvailable ÷ settlementNeed, as a Decimal (0-need → 1). */
  coverageRatio: Decimal;
  /** True when settlement is fully covered without touching illiquids. */
  covered: boolean;
  /** Shortfall that would force an illiquid fire-sale (0 when covered). */
  shortfall: Money;
  /** The order liquidity is drained to fund settlement. */
  fundingWaterfall: FundingStep[];
  /** What each beneficiary nets after tax. */
  beneficiaryShares: BeneficiaryShare[];
  /** Nodes of the succession flow graph. */
  flowNodes: FlowNode[];
  /** Edges of the succession flow graph. */
  flowLinks: FlowLink[];
}

function assertCurrency(plan: EstatePlan, m: Money, where: string): void {
  if (m.currency !== plan.currency) {
    throw new EstateError(
      `currency mismatch in ${where}: ${m.currency} vs plan ${plan.currency}`,
    );
  }
}

function resolveHaircut(
  cls: LiquidityClass,
  overrides?: Partial<Record<LiquidityClass, Decimal | string | number>>,
): Decimal {
  const raw = overrides?.[cls];
  const dec =
    raw === undefined
      ? new Decimal(DEFAULT_LIQUIDITY_HAIRCUTS[cls])
      : new Decimal(typeof raw === "number" ? raw.toString() : raw);
  if (!dec.isFinite() || dec.isNegative() || dec.greaterThan(1)) {
    throw new EstateError(`haircut for ${cls} must be in [0, 1]`);
  }
  return dec;
}

function fraction(value: number | undefined, name: string): Decimal {
  if (value === undefined) return new Decimal(0);
  const dec = new Decimal(value);
  if (!dec.isFinite() || dec.isNegative() || dec.greaterThan(1)) {
    throw new EstateError(`${name} must be a fraction in [0, 1]`);
  }
  return dec;
}

export interface AnalyzeOptions {
  /** Override the default fire-sale haircuts per liquidity class. */
  haircuts?: Partial<Record<LiquidityClass, Decimal | string | number>>;
}

/**
 * Validate a plan's structural invariants. Throws {@link EstateError} on the
 * first problem. Called by {@link analyzeEstate}; exported for explicit
 * validation at input boundaries.
 */
export function validateEstatePlan(plan: EstatePlan): void {
  if (!plan.id) throw new EstateError("plan id is required");
  fraction(plan.taxRate, "taxRate");
  fraction(plan.adminCostRate, "adminCostRate");
  assertCurrency(plan, plan.exemption, "exemption");
  if (plan.exemption.isNegative()) {
    throw new EstateError("exemption must not be negative");
  }

  const entityIds = new Set<string>();
  for (const e of plan.entities) {
    if (entityIds.has(e.id)) {
      throw new EstateError(`duplicate entity id: ${e.id}`);
    }
    entityIds.add(e.id);
  }

  const assetIds = new Set<string>();
  for (const a of plan.assets) {
    if (assetIds.has(a.id)) {
      throw new EstateError(`duplicate asset id: ${a.id}`);
    }
    assetIds.add(a.id);
    assertCurrency(plan, a.value, `asset ${a.id}`);
    if (a.value.isNegative()) {
      throw new EstateError(`asset ${a.id} value must not be negative`);
    }
    if (a.entityId !== undefined && !entityIds.has(a.entityId)) {
      throw new EstateError(
        `asset ${a.id} references unknown entity ${a.entityId}`,
      );
    }
  }

  for (const l of plan.liabilities) {
    assertCurrency(plan, l.amount, `liability ${l.id}`);
    if (l.amount.isNegative()) {
      throw new EstateError(`liability ${l.id} must not be negative`);
    }
  }

  const benIds = new Set<string>();
  for (const b of plan.beneficiaries) {
    if (benIds.has(b.id)) {
      throw new EstateError(`duplicate beneficiary id: ${b.id}`);
    }
    benIds.add(b.id);
  }

  for (const bq of plan.bequests) {
    if (!benIds.has(bq.beneficiaryId)) {
      throw new EstateError(
        `bequest ${bq.id} references unknown beneficiary ${bq.beneficiaryId}`,
      );
    }
    const hasAmount = bq.amount !== undefined;
    const hasShare = bq.residueShare !== undefined;
    if (hasAmount === hasShare) {
      throw new EstateError(
        `bequest ${bq.id} must set exactly one of amount or residueShare`,
      );
    }
    if (hasAmount) {
      assertCurrency(plan, bq.amount as Money, `bequest ${bq.id}`);
      if ((bq.amount as Money).isNegative()) {
        throw new EstateError(`bequest ${bq.id} amount must not be negative`);
      }
    }
    if (hasShare && !((bq.residueShare as number) >= 0)) {
      throw new EstateError(
        `bequest ${bq.id} residueShare must be a non-negative number`,
      );
    }
  }
}

function relationOf(
  plan: EstatePlan,
  beneficiaryId: string,
): Beneficiary["relation"] {
  return (
    plan.beneficiaries.find((b) => b.id === beneficiaryId)?.relation ?? "other"
  );
}

/** True for relations whose bequests pass free of estate tax (marital/charitable). */
function isExemptRelation(relation: Beneficiary["relation"]): boolean {
  return relation === "spouse" || relation === "charity";
}

/**
 * Analyze an estate plan: compute the estate tax, the liquidity-at-death
 * coverage, the funding waterfall, per-beneficiary net inheritance, and the
 * entity → beneficiary succession flow.
 *
 * Pure and deterministic. The returned {@link EstateAnalysis} is the single
 * source of truth the estate view renders from.
 */
export function analyzeEstate(
  plan: EstatePlan,
  options: AnalyzeOptions = {},
): EstateAnalysis {
  validateEstatePlan(plan);
  const ccy = plan.currency;
  const zero = Money.zero(ccy);

  // --- Roll up gross estate by liquidity class -----------------------------
  const grossByClass = new Map<LiquidityClass, Money>();
  for (const cls of LIQUIDITY_CLASSES) grossByClass.set(cls, zero);
  for (const a of plan.assets) {
    grossByClass.set(a.liquidity, grossByClass.get(a.liquidity)!.plus(a.value));
  }
  const grossEstate = sumMoney(
    plan.assets.map((a) => a.value),
    ccy,
  );

  const buckets: LiquidityBucket[] = LIQUIDITY_CLASSES.map((cls) => {
    const gross = grossByClass.get(cls)!;
    const haircut = resolveHaircut(cls, options.haircuts);
    const net = gross.times(new Decimal(1).minus(haircut));
    return { cls, label: LIQUIDITY_CLASS_LABELS[cls], gross, haircut, net };
  });

  // --- Debts, admin --------------------------------------------------------
  const totalDebts = sumMoney(
    plan.liabilities.map((l) => l.amount),
    ccy,
  );
  const adminCost = grossEstate
    .times(fraction(plan.adminCostRate, "adminCostRate"))
    .round();

  // --- Exempt (marital/charitable) bequests --------------------------------
  // Estate available for distribution before tax: gross − debts − admin.
  const distributableBase = grossEstate.minus(totalDebts).minus(adminCost);
  const distributablePos = distributableBase.isNegative()
    ? zero
    : distributableBase;

  // Resolve every bequest to a gross value out of the distributable base, so
  // we can identify how much is exempt. Fixed legacies first, then residue.
  const fixedTotal = sumMoney(
    plan.bequests
      .filter((b) => b.amount !== undefined)
      .map((b) => b.amount as Money),
    ccy,
  );
  const residue = distributablePos.minus(fixedTotal);
  const residuePos = residue.isNegative() ? zero : residue;
  const shareWeights = plan.bequests
    .filter((b) => b.residueShare !== undefined)
    .map((b) => b.residueShare as number);
  const totalShare = shareWeights.reduce((a, b) => a + b, 0);

  const grossByBequest = new Map<string, Money>();
  for (const bq of plan.bequests) {
    if (bq.amount !== undefined) {
      // If fixed legacies exceed the estate they abate pro-rata.
      let g = bq.amount;
      if (fixedTotal.greaterThan(distributablePos) && fixedTotal.isPositive()) {
        g = distributablePos.times(bq.amount.amount.div(fixedTotal.amount));
      }
      grossByBequest.set(bq.id, g);
    } else {
      const share = bq.residueShare as number;
      const g =
        totalShare > 0
          ? residuePos.times(new Decimal(share).div(totalShare))
          : zero;
      grossByBequest.set(bq.id, g);
    }
  }

  const exemptBequests = sumMoney(
    plan.bequests
      .filter((bq) => isExemptRelation(relationOf(plan, bq.beneficiaryId)))
      .map((bq) => grossByBequest.get(bq.id)!),
    ccy,
  );

  // --- Estate tax ----------------------------------------------------------
  // Net estate (after debts, admin, exempt transfers), then lifetime exemption.
  const netEstate = distributablePos.minus(exemptBequests);
  const netEstatePos = netEstate.isNegative() ? zero : netEstate;
  const exemptionApplied = plan.exemption.greaterThan(netEstatePos)
    ? netEstatePos
    : plan.exemption;
  const taxableEstate = netEstatePos.minus(exemptionApplied);
  const estateTax = taxableEstate
    .times(fraction(plan.taxRate, "taxRate"))
    .round();

  // --- Settlement need & liquidity coverage --------------------------------
  const settlementNeed = estateTax.plus(totalDebts).plus(adminCost);

  const liquidAvailable = sumMoney(
    buckets.filter((b) => b.cls !== "illiquid").map((b) => b.net),
    ccy,
  );
  const totalRealizable = sumMoney(
    buckets.map((b) => b.net),
    ccy,
  );

  const coverageRatio = settlementNeed.isZero()
    ? new Decimal(1)
    : liquidAvailable.amount.div(settlementNeed.amount);
  const covered = !liquidAvailable.lessThan(settlementNeed);
  const shortfallRaw = settlementNeed.minus(liquidAvailable);
  const shortfall = shortfallRaw.isNegative() ? zero : shortfallRaw;

  // Funding waterfall: drain cash, then marketable, then illiquid until the
  // (net) settlement need is met.
  const fundingWaterfall: FundingStep[] = [];
  let remaining = settlementNeed;
  for (const cls of LIQUIDITY_CLASSES) {
    if (!remaining.isPositive()) break;
    const bucket = buckets.find((b) => b.cls === cls)!;
    if (bucket.net.isZero()) continue;
    const netUsed = bucket.net.lessThan(remaining) ? bucket.net : remaining;
    // Back out the gross value consumed to realize `netUsed`.
    const oneMinus = new Decimal(1).minus(bucket.haircut);
    const grossUsed = oneMinus.isZero()
      ? bucket.gross
      : netUsed.dividedBy(oneMinus);
    fundingWaterfall.push({
      cls,
      label: bucket.label,
      grossUsed: grossUsed.round(),
      netUsed,
    });
    remaining = remaining.minus(netUsed);
  }

  const distributable = grossEstate.minus(settlementNeed);

  // --- Per-beneficiary net after tax ---------------------------------------
  // Non-exempt gross bears the estate tax pro-rata to its (non-exempt) gross.
  const nonExemptGross = sumMoney(
    plan.bequests
      .filter((bq) => !isExemptRelation(relationOf(plan, bq.beneficiaryId)))
      .map((bq) => grossByBequest.get(bq.id)!),
    ccy,
  );

  const byBeneficiary = new Map<string, BeneficiaryShare>();
  for (const bq of plan.bequests) {
    const relation = relationOf(plan, bq.beneficiaryId);
    const gross = grossByBequest.get(bq.id)!;
    const exempt = isExemptRelation(relation);
    const tax =
      exempt || nonExemptGross.isZero()
        ? zero
        : estateTax.times(gross.amount.div(nonExemptGross.amount)).round();
    const existing = byBeneficiary.get(bq.beneficiaryId);
    const name =
      plan.beneficiaries.find((b) => b.id === bq.beneficiaryId)?.name ??
      bq.beneficiaryId;
    if (existing) {
      existing.gross = existing.gross.plus(gross);
      existing.tax = existing.tax.plus(tax);
      existing.net = existing.gross.minus(existing.tax);
    } else {
      byBeneficiary.set(bq.beneficiaryId, {
        beneficiaryId: bq.beneficiaryId,
        name,
        relation,
        gross,
        tax,
        net: gross.minus(tax),
      });
    }
  }
  const beneficiaryShares = [...byBeneficiary.values()].sort((a, b) =>
    b.net.compare(a.net),
  );

  // --- Succession flow graph (estate → entity → beneficiary) ---------------
  const { flowNodes, flowLinks } = buildFlow(
    plan,
    grossByBequest,
    estateTax,
    ccy,
  );

  return {
    currency: ccy,
    grossEstate,
    totalDebts,
    adminCost,
    exemptBequests,
    exemptionApplied,
    netEstate: netEstatePos,
    taxableEstate,
    estateTax,
    settlementNeed,
    distributable,
    buckets,
    liquidAvailable,
    totalRealizable,
    coverageRatio,
    covered,
    shortfall,
    fundingWaterfall,
    beneficiaryShares,
    flowNodes,
    flowLinks,
  };
}

/**
 * Build the entity / succession flow: a small directed graph the view renders
 * as a Sankey-style diagram. Value flows from the estate, through each asset's
 * holding entity, to the beneficiaries; the estate tax is split off into a
 * dedicated `tax` sink so the diagram conserves value.
 */
function buildFlow(
  plan: EstatePlan,
  grossByBequest: Map<string, Money>,
  estateTax: Money,
  ccy: string,
): { flowNodes: FlowNode[]; flowLinks: FlowLink[] } {
  const zero = Money.zero(ccy);
  const nodes: FlowNode[] = [{ id: "estate", label: "Estate", kind: "estate" }];
  const links: FlowLink[] = [];

  // Estate → entity (or estate → "held personally") sized by asset value.
  const PERSONAL = "__personal__";
  const entityTotals = new Map<string, Money>();
  const entityOrder: string[] = [];
  for (const a of plan.assets) {
    const key = a.entityId ?? PERSONAL;
    if (!entityTotals.has(key)) entityOrder.push(key);
    entityTotals.set(key, (entityTotals.get(key) ?? zero).plus(a.value));
  }
  for (const key of entityOrder) {
    const total = entityTotals.get(key)!;
    if (total.isZero()) continue;
    const label =
      key === PERSONAL
        ? "Held personally"
        : (plan.entities.find((e) => e.id === key)?.name ?? key);
    nodes.push({ id: `entity:${key}`, label, kind: "entity" });
    links.push({ source: "estate", target: `entity:${key}`, value: total });
  }

  const entityKeys = entityOrder.filter((k) => !entityTotals.get(k)!.isZero());
  const entityGrand = sumMoney(
    entityKeys.map((k) => entityTotals.get(k)!),
    ccy,
  );

  // Tax sink.
  if (estateTax.isPositive()) {
    nodes.push({ id: "tax", label: "Estate tax", kind: "tax" });
  }

  // Each beneficiary's gross is pro-rated across the entities by entity weight,
  // which keeps the diagram readable while conserving totals.
  for (const ben of plan.beneficiaries) {
    const benGross = sumMoney(
      plan.bequests
        .filter((bq) => bq.beneficiaryId === ben.id)
        .map((bq) => grossByBequest.get(bq.id)!),
      ccy,
    );
    if (benGross.isZero()) continue;
    nodes.push({ id: `ben:${ben.id}`, label: ben.name, kind: "beneficiary" });
    for (const k of entityKeys) {
      const w = entityGrand.isZero()
        ? new Decimal(0)
        : entityTotals.get(k)!.amount.div(entityGrand.amount);
      const v = benGross.times(w);
      if (v.isPositive()) {
        links.push({
          source: `entity:${k}`,
          target: `ben:${ben.id}`,
          value: v,
        });
      }
    }
  }

  // Tax flows from the entity layer (pro-rata) to the tax sink.
  if (estateTax.isPositive()) {
    for (const k of entityKeys) {
      const w = entityGrand.isZero()
        ? new Decimal(0)
        : entityTotals.get(k)!.amount.div(entityGrand.amount);
      const v = estateTax.times(w);
      if (v.isPositive()) {
        links.push({ source: `entity:${k}`, target: "tax", value: v });
      }
    }
  }

  return { flowNodes: nodes, flowLinks: links };
}

/** Format a coverage ratio as a percentage string, e.g. `1.42` → `142%`. */
export function formatCoverage(ratio: Decimal): string {
  return `${ratio.times(100).toDecimalPlaces(0).toFixed()}%`;
}
