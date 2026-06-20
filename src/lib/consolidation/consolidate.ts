import { Decimal } from "decimal.js";

import { Money, sumMoney } from "../money";
import type { Entity } from "../org/entity";
import { effectiveOwnership, validateOrg } from "../org/tree";

/**
 * Multi-entity consolidation with intercompany eliminations.
 *
 * A family office's structure is a web of trusts, holdcos, LLCs, funds, SPVs
 * and individuals wired together by *fractional* ownership edges. Each entity
 * reports a standalone net asset value (NAV) — the value of the assets it holds
 * *in its own right*. On top of that, some entities carry an **intercompany
 * investment**: the book value of a stake they hold in *another family entity*.
 *
 * Naively summing every entity's standalone NAV double-counts: a holdco's
 * investment in a subsidiary is the *same* economic value as that subsidiary's
 * own assets, counted twice. The job of consolidation is to remove the
 * double-count so the family sees one **consolidated net worth** — no asset
 * counted twice, no intercompany value invented.
 *
 * The model (the "oracle" rule):
 *
 *   consolidated = Σ_entity ownedNav(entity)               // attributed equity
 *                = Σ_entity standaloneNav(entity) × effectivePct(root, entity)
 *
 * where `effectivePct` is the root's look-through ownership of the entity
 * (product of edge fractions, summed over every path). Equivalently, the same
 * total is reached by:
 *
 *   grossNav  = Σ standaloneNav                            // sum of all NAVs
 *   minorityInterest = Σ standaloneNav × (1 − effectivePct) // owned by outsiders
 *   intercompanyEliminations = Σ carrying value of intra-family investments,
 *                              attributed by the holder's effectivePct
 *
 *   consolidated = grossNav − intercompanyEliminations − minorityInterest
 *
 * Intercompany investments never change the consolidated total — they are
 * pure transfers of the *same* value between two family entities — so they
 * must be eliminated to avoid showing them on top of the underlying assets.
 * This identity (gross − eliminations − minority = Σ attributed) is the
 * reconciliation the unit tests pin down.
 *
 * READ-ONLY: this reports the consolidated picture. It never moves money,
 * restructures ownership, or files anything. All arithmetic is exact
 * {@link Decimal}/{@link Money}; pure and React-free for unit testing.
 */

/** Carrying value of one entity's stake in *another family entity*. */
export interface IntercompanyInvestment {
  /** Entity that holds the stake on its balance sheet. */
  holderId: string;
  /** Family entity the stake is in. */
  investeeId: string;
  /** Book/carrying value of the stake, as a money value. */
  value: { amount: string; currency: string };
}

/** Input to {@link consolidate}: the standalone facts about each entity. */
export interface ConsolidationInput {
  entities: readonly Entity[];
  /**
   * Intercompany investments to eliminate. Each is a stake one family entity
   * holds in another; its value is part of the holder's standalone NAV and is
   * removed so it is not counted on top of the investee's own assets.
   */
  intercompany?: readonly IntercompanyInvestment[];
  /** Root entity to consolidate up to (whose family-wide net worth we report). */
  rootId: string;
  /** Reporting currency; entities must all report in it. Defaults to the root's. */
  currency?: string;
}

/** Per-entity line in the consolidated statement. */
export interface ConsolidatedEntityLine {
  entityId: string;
  entityName: string;
  kind: Entity["kind"];
  /** Effective ownership of this entity by the root, in [0, 1]. */
  effectivePct: number;
  /** Entity's own standalone NAV (its direct assets). */
  standaloneNav: Money;
  /** Portion of the standalone NAV the root actually owns (`× effectivePct`). */
  ownedNav: Money;
  /** Portion owned by parties outside the root (`× (1 − effectivePct)`). */
  minorityInterest: Money;
  /** Intercompany investments this entity holds that are eliminated. */
  intercompanyHeld: Money;
}

/** One intercompany elimination, attributed to the holder's effective stake. */
export interface EliminationLine {
  holderId: string;
  holderName: string;
  investeeId: string;
  investeeName: string;
  /** Carrying value of the stake on the holder's books. */
  carryingValue: Money;
  /** Effective ownership of the *holder* by the root. */
  holderEffectivePct: number;
  /** Carrying value attributable to the root: `carryingValue × holderEffectivePct`. */
  eliminated: Money;
}

/** Full consolidated net-worth statement for a root entity. */
export interface ConsolidationReport {
  rootId: string;
  rootName: string;
  currency: string;
  /** Sum of every entity's standalone NAV (before eliminations). */
  grossNav: Money;
  /** Total intercompany value removed (attributed to the root). */
  intercompanyEliminations: Money;
  /** Standalone NAV owned by parties outside the root. */
  minorityInterest: Money;
  /**
   * Consolidated net worth: `grossNav − eliminations − minorityInterest`,
   * which equals `Σ ownedNav − Σ eliminated`. No value counted twice.
   */
  consolidatedNetWorth: Money;
  /** Per-entity breakdown, sorted by owned NAV descending. */
  entities: ConsolidatedEntityLine[];
  /** Per-investment elimination detail, sorted by eliminated value descending. */
  eliminations: EliminationLine[];
}

function moneyFrom(
  v: { amount: string; currency: string },
  expected: string,
): Money {
  const m = Money.of(v.amount, v.currency);
  if (m.currency !== expected) {
    throw new Error(
      `currency mismatch: expected ${expected}, got ${m.currency}`,
    );
  }
  return m;
}

/** Scale a Money by a [0,1] fraction with exact Decimal arithmetic. */
function scale(money: Money, fraction: number): Money {
  return money.times(new Decimal(fraction));
}

/**
 * Consolidate a family structure into one net-worth statement with
 * intercompany eliminations. Throws on an invalid org (cycle / dangling parent
 * / duplicate id) or an unknown root — validate first to surface issues.
 */
export function consolidate(input: ConsolidationInput): ConsolidationReport {
  const { entities, rootId } = input;
  const intercompany = input.intercompany ?? [];

  const validation = validateOrg(entities);
  if (!validation.ok) {
    throw new Error(
      `cannot consolidate: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const byId = new Map(entities.map((e) => [e.id, e]));
  const root = byId.get(rootId);
  if (!root) throw new Error(`unknown root entity: ${rootId}`);

  const currency =
    input.currency ?? root.nav?.currency ?? "USD";

  // Effective ownership of each entity by the root (memoized per id).
  const effPct = new Map<string, number>();
  for (const e of entities) {
    effPct.set(e.id, effectiveOwnership(entities, rootId, e.id));
  }

  // Consolidation scope: only entities the root actually owns some of (the
  // root itself plus everything below it). Entities the root does not own —
  // e.g. a parent trust above a holdco being consolidated — are out of scope
  // and excluded entirely (they are not minority interests of the root).
  const inScope = (id: string): boolean =>
    id === rootId || (effPct.get(id) ?? 0) > 0;
  const scopedEntities = entities.filter((e) => inScope(e.id));

  // Per-entity intercompany totals held (for the entity line items).
  const heldByHolder = new Map<string, Money>();
  for (const ic of intercompany) {
    if (!byId.has(ic.holderId)) {
      throw new Error(`intercompany holder not found: ${ic.holderId}`);
    }
    if (!byId.has(ic.investeeId)) {
      throw new Error(`intercompany investee not found: ${ic.investeeId}`);
    }
    if (ic.holderId === ic.investeeId) {
      throw new Error(`entity ${ic.holderId} cannot invest in itself`);
    }
    const v = moneyFrom(ic.value, currency);
    heldByHolder.set(
      ic.holderId,
      (heldByHolder.get(ic.holderId) ?? Money.zero(currency)).plus(v),
    );
  }

  const entityLines: ConsolidatedEntityLine[] = scopedEntities.map((e) => {
    const eff = effPct.get(e.id) ?? 0;
    const standalone = e.nav
      ? moneyFrom(e.nav, currency)
      : Money.zero(currency);
    const owned = scale(standalone, eff);
    const minority = standalone.minus(owned);
    return {
      entityId: e.id,
      entityName: e.name,
      kind: e.kind,
      effectivePct: eff,
      standaloneNav: standalone,
      ownedNav: owned,
      minorityInterest: minority,
      intercompanyHeld: heldByHolder.get(e.id) ?? Money.zero(currency),
    };
  });

  const eliminationLines: EliminationLine[] = intercompany
    // Only stakes held by an in-scope entity matter to this root's
    // consolidated picture; a stake held entirely outside the root's tree
    // is not part of what the root owns and is nothing to eliminate.
    .filter((ic) => inScope(ic.holderId))
    .map((ic) => {
      const holder = byId.get(ic.holderId)!;
      const investee = byId.get(ic.investeeId)!;
      const carrying = moneyFrom(ic.value, currency);
      const holderEff = effPct.get(ic.holderId) ?? 0;
      return {
        holderId: ic.holderId,
        holderName: holder.name,
        investeeId: ic.investeeId,
        investeeName: investee.name,
        carryingValue: carrying,
        holderEffectivePct: holderEff,
        // Only the slice of the intercompany value the root actually owns is
        // part of its consolidated picture, so only that slice is eliminated.
        eliminated: scale(carrying, holderEff),
      };
    });

  const grossNav = sumMoney(
    entityLines.map((l) => l.standaloneNav),
    currency,
  );
  const minorityInterest = sumMoney(
    entityLines.map((l) => l.minorityInterest),
    currency,
  );
  const intercompanyEliminations = sumMoney(
    eliminationLines.map((l) => l.eliminated),
    currency,
  );
  // consolidated = Σ ownedNav − Σ eliminated
  //             = grossNav − minorityInterest − eliminations
  const consolidatedNetWorth = grossNav
    .minus(minorityInterest)
    .minus(intercompanyEliminations);

  entityLines.sort((a, b) => b.ownedNav.compare(a.ownedNav));
  eliminationLines.sort((a, b) => b.eliminated.compare(a.eliminated));

  return {
    rootId,
    rootName: root.name,
    currency,
    grossNav,
    intercompanyEliminations,
    minorityInterest,
    consolidatedNetWorth,
    entities: entityLines,
    eliminations: eliminationLines,
  };
}
