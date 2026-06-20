import { Decimal } from "decimal.js";

import { Money } from "../money";
import type { Entity } from "../org/entity";
import { effectiveOwnership, validateOrg } from "../org/tree";

import {
  ASSET_CLASSES,
  type AssetClass,
  type EntityHoldings,
} from "./exposure";

/**
 * Cross-entity consolidation + look-through exposure roll-up.
 *
 * Given an org hierarchy of {@link Entity} records (with partial ownership
 * edges) and the direct holdings on each entity's balance sheet, this computes
 * the *true underlying exposure* of a chosen root entity — what the family
 * actually owns once you see through every ownership stake.
 *
 * The attribution rule (the "oracle"): an entity's contribution to the root's
 * exposure is its direct holding value multiplied by the root's effective
 * ownership of that entity — the sum over every ownership path of the product
 * of the edge fractions. A holdco that owns 60% of a fund that owns 50% of an
 * SPV looks through to 30% of that SPV's assets.
 *
 * All arithmetic runs in {@link Decimal} via {@link Money}: no floating-point
 * currency (AGENTS.md). Pure and deterministic; React-free so it is unit
 * testable in isolation.
 */

/** Per-entity attribution detail behind a consolidated line. */
export interface ContributionRow {
  entityId: string;
  entityName: string;
  /** Effective ownership of this entity by the root, in [0, 1]. */
  effectivePct: number;
  /** Gross value this entity holds directly in the bucket. */
  gross: Money;
  /** `gross × effectivePct` — what the root actually owns of it. */
  attributed: Money;
}

/** One asset class consolidated through to the root. */
export interface ExposureLine {
  assetClass: AssetClass;
  /** Look-through value the root owns in this class. */
  value: Money;
  /** Share of the root's total look-through exposure (0..1). */
  weight: number;
  /** Per-entity attribution that sums to {@link value}. */
  contributions: ContributionRow[];
}

/** Full consolidated look-through report for one root entity. */
export interface LookThroughReport {
  rootId: string;
  rootName: string;
  currency: string;
  /** Total look-through value across all asset classes. */
  total: Money;
  /** One line per asset class that has non-zero look-through value, sorted by value desc. */
  lines: ExposureLine[];
}

function holdingsByEntity(
  holdings: readonly EntityHoldings[],
): Map<string, EntityHoldings> {
  const map = new Map<string, EntityHoldings>();
  for (const h of holdings) {
    if (map.has(h.entityId)) {
      throw new Error(`duplicate holdings entry for entity ${h.entityId}`);
    }
    map.set(h.entityId, h);
  }
  return map;
}

/**
 * Resolve the reporting currency. All holdings must share one currency (this
 * unit consolidates a single-currency book; FX is a separate concern). Returns
 * the currency, or a fallback when there are no holdings at all.
 */
function resolveCurrency(
  holdings: readonly EntityHoldings[],
  fallback: string,
): string {
  let currency: string | undefined;
  for (const eh of holdings) {
    for (const h of eh.holdings) {
      const c = Money.of(h.value.amount, h.value.currency).currency;
      if (currency === undefined) currency = c;
      else if (currency !== c) {
        throw new Error(
          `look-through consolidation requires a single currency; saw ${currency} and ${c}`,
        );
      }
    }
  }
  return currency ?? fallback;
}

/**
 * Consolidate the org hierarchy and holdings into a single root's look-through
 * exposure by asset class.
 *
 * @param entities the org hierarchy (validated for cycles / dangling parents).
 * @param holdings per-entity direct holdings.
 * @param rootId the entity to report from (e.g. the family trust).
 * @param opts.currency fallback currency when no holdings exist.
 */
export function consolidateLookThrough(
  entities: readonly Entity[],
  holdings: readonly EntityHoldings[],
  rootId: string,
  opts: { currency?: string } = {},
): LookThroughReport {
  const validation = validateOrg(entities);
  if (!validation.ok) {
    throw new Error(
      `cannot consolidate: org is invalid: ${validation.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  const root = entities.find((e) => e.id === rootId);
  if (!root) {
    throw new Error(`root entity not found: ${rootId}`);
  }

  const byId = new Map(entities.map((e) => [e.id, e] as const));
  // Validate at most one holdings entry per entity (throws on a duplicate).
  holdingsByEntity(holdings);
  const currency = resolveCurrency(holdings, opts.currency ?? "USD");

  // Precompute the root's effective ownership of every entity (memoized inside
  // effectiveOwnership; we call once per entity).
  const effective = new Map<string, number>();
  for (const e of entities) {
    effective.set(e.id, effectiveOwnership(entities, rootId, e.id));
  }

  // Accumulate per-asset-class: attributed total + contribution rows.
  type Acc = { total: Decimal; rows: ContributionRow[] };
  const acc = new Map<AssetClass, Acc>();
  for (const cls of ASSET_CLASSES) {
    acc.set(cls, { total: new Decimal(0), rows: [] });
  }

  for (const eh of holdings) {
    const pct = effective.get(eh.entityId) ?? 0;
    if (pct <= 0) continue; // root does not own this entity at all
    const entity = byId.get(eh.entityId);
    if (!entity) {
      throw new Error(
        `holdings reference unknown entity ${eh.entityId}`,
      );
    }
    // Combine same-asset-class holdings within the entity into one gross value.
    const grossByClass = new Map<AssetClass, Decimal>();
    for (const h of eh.holdings) {
      const m = Money.of(h.value.amount, h.value.currency);
      const prev = grossByClass.get(h.assetClass) ?? new Decimal(0);
      grossByClass.set(h.assetClass, prev.plus(m.amount));
    }
    for (const [cls, grossAmt] of grossByClass) {
      if (grossAmt.isZero()) continue;
      const gross = Money.of(grossAmt, currency);
      // attributed = gross × effectivePct, kept in Decimal.
      const attributed = gross.times(pct);
      const a = acc.get(cls)!;
      a.total = a.total.plus(attributed.amount);
      a.rows.push({
        entityId: eh.entityId,
        entityName: entity.name,
        effectivePct: pct,
        gross,
        attributed,
      });
    }
  }

  let total = new Decimal(0);
  for (const cls of ASSET_CLASSES) total = total.plus(acc.get(cls)!.total);

  const lines: ExposureLine[] = [];
  for (const cls of ASSET_CLASSES) {
    const a = acc.get(cls)!;
    if (a.total.isZero()) continue;
    const weight = total.isZero() ? 0 : a.total.div(total).toNumber();
    // Sort contributions by attributed value desc for stable, readable output.
    const contributions = [...a.rows].sort((x, y) => {
      const cmp = y.attributed.amount.comparedTo(x.attributed.amount);
      if (cmp !== 0) return cmp;
      return x.entityId.localeCompare(y.entityId);
    });
    lines.push({
      assetClass: cls,
      value: Money.of(a.total, currency),
      weight,
      contributions,
    });
  }

  // Sort lines by value desc (ties broken by asset-class order for stability).
  const order = new Map(ASSET_CLASSES.map((c, i) => [c, i] as const));
  lines.sort((x, y) => {
    const cmp = y.value.amount.comparedTo(x.value.amount);
    if (cmp !== 0) return cmp;
    return (order.get(x.assetClass) ?? 0) - (order.get(y.assetClass) ?? 0);
  });

  return {
    rootId,
    rootName: root.name,
    currency,
    total: Money.of(total, currency),
    lines,
  };
}

/**
 * Sum the *direct* (non-look-through) gross value an entity holds — i.e. its
 * own balance-sheet total, ignoring ownership. Useful for comparing reported
 * book value against the family's economic share.
 */
export function directGross(
  holdings: readonly EntityHoldings[],
  entityId: string,
  currency = "USD",
): Money {
  let total = new Decimal(0);
  for (const eh of holdings) {
    if (eh.entityId !== entityId) continue;
    for (const h of eh.holdings) {
      total = total.plus(Money.of(h.value.amount, h.value.currency).amount);
    }
  }
  return Money.of(total, currency);
}
