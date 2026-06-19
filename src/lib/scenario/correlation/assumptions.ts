/**
 * Documented cross-asset correlation assumptions for scenario / stress work.
 *
 * Unlike `src/lib/risk/correlation.ts` — which *measures* correlation from an
 * observed return series — this module encodes a **forward-looking, assumption
 * based** correlation matrix at the {@link AssetClass} level. There is rarely a
 * clean, long, liquid return history for a family office's collectibles (a
 * vineyard, a LEGO collection, a private-equity stake), so for scenario
 * modelling we lean on a documented house view instead of a noisy empirical
 * estimate.
 *
 * Every number below is an *assumption*, not a measurement. The rationale for
 * each block is recorded in {@link CORRELATION_RATIONALE} so the house view is
 * auditable and can be challenged. These are long-horizon, "normal regime"
 * figures; correlations notoriously rise toward 1 in a crisis, which is what
 * the separate stress-scenario layer is for.
 *
 * The matrix is, by construction, symmetric with a unit diagonal, every entry
 * in `[-1, 1]`, and positive semi-definite — all three are asserted by the test
 * suite via the structural checks in `./matrix`.
 *
 * READ-ONLY product: this is a reporting/analytics assumption set; nothing here
 * moves money or places trades.
 */

import { ASSET_CLASSES, type AssetClass } from "../../model/asset-class";
import {
  type LabeledCorrelationMatrix,
  squareDimension,
} from "./matrix";

/**
 * Symmetric upper-triangular source of the house-view correlation assumptions,
 * indexed `[a][b]` with `a <= b` in {@link ASSET_CLASSES} order. The full
 * symmetric matrix and the diagonal of `1`s are derived from this; keeping a
 * single triangular source of truth makes symmetry impossible to get wrong.
 *
 * Pairs not listed default to `0` (assumed uncorrelated). Values are rounded to
 * two decimals on purpose — they are judgement calls, and false precision would
 * be misleading.
 */
const PAIRWISE: Partial<Record<AssetClass, Partial<Record<AssetClass, number>>>> =
  {
    equity: {
      etf: 0.92, // broad ETFs are mostly equity beta
      crypto: 0.3, // risk-on co-movement, far from a hedge
      pe: 0.7, // private equity is levered public-equity beta, lagged/smoothed
      bond: -0.1, // mild flight-to-quality offset
      car: 0.15, // collectibles share a wealth/risk-appetite factor
      wine: 0.15,
      art: 0.15,
      watch: 0.15,
      lego: 0.1,
    },
    bond: {
      cash: 0.2, // both rate-sensitive, low duration cash less so
      etf: -0.08, // a bond/equity-blend ETF nets to slightly negative vs pure bonds
    },
    etf: {
      crypto: 0.28,
      pe: 0.65,
      car: 0.15,
      wine: 0.15,
      art: 0.15,
      watch: 0.15,
      lego: 0.1,
    },
    cash: {
      // cash is the numeraire; near-zero correlation to risk assets by design
    },
    crypto: {
      pe: 0.25,
    },
    forest: {
      vineyard: 0.45, // both real-asset farmland: shared land + commodity factors
      wine: 0.2, // wine output ties loosely to vineyard/agricultural value
    },
    wine: {
      art: 0.45, // passion/collectible market, shared liquidity + taste cycles
      watch: 0.4,
      car: 0.4,
      lego: 0.25,
      vineyard: 0.35, // fine wine value tracks the underlying vineyard somewhat
    },
    art: {
      watch: 0.4,
      car: 0.4,
      lego: 0.3,
    },
    lego: {
      watch: 0.25,
      car: 0.2,
    },
    car: {
      watch: 0.45, // mechanical-collectible enthusiast overlap
    },
    vineyard: {
      // covered above via forest/wine
    },
    pe: {
      // covered above via equity/etf/crypto
    },
    watch: {
      // covered above
    },
  };

/**
 * Human-readable rationale for each non-trivial correlation block, keyed by a
 * `"a:b"` pair string (assets in {@link ASSET_CLASSES} order). Exposed so the
 * house view is documented and auditable rather than a magic table.
 */
export const CORRELATION_RATIONALE: Readonly<Record<string, string>> = {
  "equity:etf":
    "Broad ETFs are dominated by equity beta, so they move almost in lockstep with direct equity holdings.",
  "equity:pe":
    "Private equity is essentially levered public-equity beta; reported marks are smoothed and lagged, which damps the measured (but not the economic) correlation.",
  "equity:bond":
    "A mild flight-to-quality effect makes high-grade bonds a partial offset to equities in a normal regime.",
  "equity:crypto":
    "Crypto trades as a risk-on asset and co-moves with equities in risk-off episodes, but it is far from an equity proxy.",
  "forest:vineyard":
    "Forest land and vineyards are both productive farmland: they share land-value and agricultural-commodity factors.",
  "wine:art":
    "Fine wine and art are passion/collectible markets driven by the same wealth cycle, liquidity, and shifts in taste.",
  "car:watch":
    "Classic cars and watches share a mechanical-collectible enthusiast base and tend to rise and fall together.",
  "wine:vineyard":
    "Fine-wine prices partly reflect the value of the underlying vineyard and vintage, giving a moderate link.",
  collectibles:
    "All collectibles (wine, art, cars, watches, LEGO) load on a common 'passion asset' wealth/liquidity factor, giving them mutually positive but moderate correlations and a small positive link to equities via risk appetite.",
  cash:
    "Cash is treated as the numéraire: assumed uncorrelated with risk assets, with only a mild positive link to short-duration bonds.",
};

/**
 * The full house-view cross-asset correlation matrix, labeled with every
 * {@link AssetClass} in {@link ASSET_CLASSES} order.
 *
 * Derived once from {@link PAIRWISE}: unit diagonal, symmetric by construction,
 * unlisted pairs zero. This is the canonical assumption set the scenario engine
 * consumes.
 */
export const ASSET_CLASS_CORRELATIONS: LabeledCorrelationMatrix = buildMatrix();

function buildMatrix(): LabeledCorrelationMatrix {
  const keys = [...ASSET_CLASSES];
  const index = new Map<AssetClass, number>(keys.map((k, i) => [k, i]));
  const n = keys.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  for (let i = 0; i < n; i++) matrix[i][i] = 1;

  for (const [aKey, row] of Object.entries(PAIRWISE)) {
    const a = aKey as AssetClass;
    if (!row) continue;
    for (const [bKey, value] of Object.entries(row)) {
      const b = bKey as AssetClass;
      if (value === undefined) continue;
      const i = index.get(a);
      const j = index.get(b);
      if (i === undefined || j === undefined) {
        throw new Error(`unknown asset class in correlation table: ${aKey}/${bKey}`);
      }
      if (i === j) {
        throw new Error(`self-correlation must not be set explicitly: ${aKey}`);
      }
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }
  return { keys: keys as string[], matrix };
}

/**
 * Look up the assumed correlation between two asset classes from the house
 * view. Returns `1` for identical classes; symmetric in its arguments.
 */
export function assumedCorrelation(a: AssetClass, b: AssetClass): number {
  const i = ASSET_CLASS_CORRELATIONS.keys.indexOf(a);
  const j = ASSET_CLASS_CORRELATIONS.keys.indexOf(b);
  return ASSET_CLASS_CORRELATIONS.matrix[i][j];
}

/**
 * Build the sub-matrix of the house view restricted to `selected` asset
 * classes, preserving their given order. Useful when a family holds only a few
 * of the classes and you want a correlation matrix sized to the actual book.
 *
 * Throws on an empty selection or a duplicate class (an ambiguous request).
 */
export function correlationSubMatrix(
  selected: readonly AssetClass[],
): LabeledCorrelationMatrix {
  if (selected.length === 0) {
    throw new Error("correlationSubMatrix requires at least one asset class");
  }
  const seen = new Set<AssetClass>();
  for (const c of selected) {
    if (seen.has(c)) {
      throw new Error(`duplicate asset class in selection: ${c}`);
    }
    seen.add(c);
  }
  const idx = selected.map((c) => {
    const i = ASSET_CLASS_CORRELATIONS.keys.indexOf(c);
    if (i < 0) throw new Error(`unknown asset class: ${c}`);
    return i;
  });
  const src = ASSET_CLASS_CORRELATIONS.matrix;
  const matrix = idx.map((ri) => idx.map((ci) => src[ri][ci]));
  // Defensive: the slice of a valid square matrix is always square.
  squareDimension(matrix);
  return { keys: [...selected] as string[], matrix };
}
