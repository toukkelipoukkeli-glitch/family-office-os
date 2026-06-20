import { Decimal } from "decimal.js";

/**
 * Single-period performance attribution (Brinson-Hood-Beebower / Brinson-Fachler).
 *
 * Attribution decomposes a portfolio's *active return* — its return minus the
 * benchmark's — into the decisions that produced it, segment by segment
 * (typically asset class or sector):
 *
 *   - **Allocation effect** — value added by over/under-weighting a segment
 *     relative to the benchmark.
 *   - **Selection effect** — value added by picking holdings inside a segment
 *     that out/under-performed that segment's benchmark.
 *   - **Interaction effect** — the cross term between the two decisions.
 *
 * Two conventions are supported:
 *   - **BHB** (Brinson-Hood-Beebower, 1986): allocation uses the *absolute*
 *     benchmark segment return.
 *   - **BF** (Brinson-Fachler, 1985): allocation uses the segment return
 *     *relative to the total benchmark return*, so an overweight is only
 *     rewarded when the segment beats the overall benchmark. This is the more
 *     widely used convention.
 *
 * Per segment, with portfolio weight `wᵢ`, benchmark weight `Wᵢ`, portfolio
 * segment return `rᵢ`, benchmark segment return `bᵢ`, and total benchmark
 * return `B`:
 *
 *   Allocation  Aᵢ = (wᵢ − Wᵢ) · (bᵢ − B·[BF])     // ·B only in BF
 *   Selection   Sᵢ = Wᵢ · (rᵢ − bᵢ)
 *   Interaction Iᵢ = (wᵢ − Wᵢ) · (rᵢ − bᵢ)
 *
 * The three effects sum *exactly* to the active return:
 *
 *   Σ (Aᵢ + Sᵢ + Iᵢ) = Σ wᵢrᵢ − Σ Wᵢbᵢ = R_p − R_b
 *
 * for both conventions (the ΣWᵢ·B term that BF subtracts telescopes to B·ΣWᵢ,
 * which equals B when benchmark weights sum to one, leaving the identity
 * intact). All maths is on {@link Decimal}; nothing here moves money.
 */

export type AttributionMethod = "BHB" | "BF";

/** One segment (asset class / sector) of the portfolio + benchmark. */
export interface AttributionSegment {
  /** Stable identifier (e.g. "equities"). */
  id: string;
  /** Human label for charts/tables. */
  label: string;
  /** Portfolio weight in the segment (fraction; e.g. 0.4 = 40%). */
  portfolioWeight: Decimal.Value;
  /** Benchmark weight in the segment (fraction). */
  benchmarkWeight: Decimal.Value;
  /** Portfolio return *within* the segment (decimal; 0.05 = +5%). */
  portfolioReturn: Decimal.Value;
  /** Benchmark return *within* the segment (decimal). */
  benchmarkReturn: Decimal.Value;
}

export interface AttributionInput {
  segments: AttributionSegment[];
  /** Effect convention. Defaults to Brinson-Fachler. */
  method?: AttributionMethod;
}

/** Per-segment attribution result. All values are decimals (0.01 = +1%). */
export interface SegmentEffect {
  id: string;
  label: string;
  portfolioWeight: Decimal;
  benchmarkWeight: Decimal;
  /** Active (over/under) weight: portfolioWeight − benchmarkWeight. */
  activeWeight: Decimal;
  portfolioReturn: Decimal;
  benchmarkReturn: Decimal;
  /** Contribution to portfolio return: wᵢ·rᵢ. */
  portfolioContribution: Decimal;
  /** Contribution to benchmark return: Wᵢ·bᵢ. */
  benchmarkContribution: Decimal;
  allocation: Decimal;
  selection: Decimal;
  interaction: Decimal;
  /** allocation + selection + interaction. */
  total: Decimal;
}

export interface AttributionResult {
  method: AttributionMethod;
  segments: SegmentEffect[];
  /** Σ wᵢrᵢ — total portfolio return. */
  portfolioReturn: Decimal;
  /** Σ Wᵢbᵢ — total benchmark return. */
  benchmarkReturn: Decimal;
  /** portfolioReturn − benchmarkReturn. */
  activeReturn: Decimal;
  /** Σ allocation effects. */
  totalAllocation: Decimal;
  /** Σ selection effects. */
  totalSelection: Decimal;
  /** Σ interaction effects. */
  totalInteraction: Decimal;
  /** Σ total effects — equals activeReturn up to rounding. */
  totalEffect: Decimal;
}

export class AttributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributionError";
  }
}

/** Tolerance for "weights sum to one" checks. */
const WEIGHT_EPS = new Decimal("1e-9");

function assertWeightsSumToOne(
  weights: Decimal[],
  which: "portfolio" | "benchmark",
): void {
  if (weights.length === 0) return;
  const sum = weights.reduce((s, w) => s.plus(w), new Decimal(0));
  if (sum.minus(1).abs().greaterThan(WEIGHT_EPS)) {
    throw new AttributionError(
      `${which} weights must sum to 1; got ${sum.toFixed(10)}`,
    );
  }
}

/**
 * Compute single-period Brinson attribution across the segments.
 *
 * Requires at least one segment; portfolio and benchmark weights must each sum
 * to 1 (within a tiny tolerance) so the effects telescope cleanly to the active
 * return. Segment ids must be unique.
 */
export function attribute(input: AttributionInput): AttributionResult {
  const method: AttributionMethod = input.method ?? "BF";
  const { segments } = input;

  if (segments.length === 0) {
    throw new AttributionError("attribute: need at least one segment");
  }

  const seen = new Set<string>();
  for (const s of segments) {
    if (seen.has(s.id)) {
      throw new AttributionError(`attribute: duplicate segment id "${s.id}"`);
    }
    seen.add(s.id);
  }

  const pw = segments.map((s) => new Decimal(s.portfolioWeight));
  const bw = segments.map((s) => new Decimal(s.benchmarkWeight));
  const pr = segments.map((s) => new Decimal(s.portfolioReturn));
  const br = segments.map((s) => new Decimal(s.benchmarkReturn));

  for (let i = 0; i < segments.length; i++) {
    for (const [name, v] of [
      ["portfolioWeight", pw[i]],
      ["benchmarkWeight", bw[i]],
      ["portfolioReturn", pr[i]],
      ["benchmarkReturn", br[i]],
    ] as const) {
      if (!v.isFinite()) {
        throw new AttributionError(
          `attribute: ${name} for segment "${segments[i].id}" must be finite`,
        );
      }
    }
    if (pw[i].isNegative() || bw[i].isNegative()) {
      throw new AttributionError(
        `attribute: weights for segment "${segments[i].id}" must be non-negative`,
      );
    }
  }

  assertWeightsSumToOne(pw, "portfolio");
  assertWeightsSumToOne(bw, "benchmark");

  // Total benchmark return B = Σ Wᵢbᵢ — needed for the Brinson-Fachler
  // allocation term.
  const benchmarkReturn = bw.reduce(
    (s, w, i) => s.plus(w.times(br[i])),
    new Decimal(0),
  );

  const segEffects: SegmentEffect[] = segments.map((s, i) => {
    const activeWeight = pw[i].minus(bw[i]);
    const excessSegReturn = pr[i].minus(br[i]); // rᵢ − bᵢ

    // BF subtracts the total benchmark return from the segment's benchmark
    // return; BHB uses the raw segment benchmark return.
    const allocReturn =
      method === "BF" ? br[i].minus(benchmarkReturn) : br[i];

    const allocation = activeWeight.times(allocReturn);
    const selection = bw[i].times(excessSegReturn);
    const interaction = activeWeight.times(excessSegReturn);

    return {
      id: s.id,
      label: s.label,
      portfolioWeight: pw[i],
      benchmarkWeight: bw[i],
      activeWeight,
      portfolioReturn: pr[i],
      benchmarkReturn: br[i],
      portfolioContribution: pw[i].times(pr[i]),
      benchmarkContribution: bw[i].times(br[i]),
      allocation,
      selection,
      interaction,
      total: allocation.plus(selection).plus(interaction),
    };
  });

  const portfolioReturn = segEffects.reduce(
    (s, e) => s.plus(e.portfolioContribution),
    new Decimal(0),
  );
  const totalAllocation = segEffects.reduce(
    (s, e) => s.plus(e.allocation),
    new Decimal(0),
  );
  const totalSelection = segEffects.reduce(
    (s, e) => s.plus(e.selection),
    new Decimal(0),
  );
  const totalInteraction = segEffects.reduce(
    (s, e) => s.plus(e.interaction),
    new Decimal(0),
  );

  return {
    method,
    segments: segEffects,
    portfolioReturn,
    benchmarkReturn,
    activeReturn: portfolioReturn.minus(benchmarkReturn),
    totalAllocation,
    totalSelection,
    totalInteraction,
    totalEffect: totalAllocation.plus(totalSelection).plus(totalInteraction),
  };
}
