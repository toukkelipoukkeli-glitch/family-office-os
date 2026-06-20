import { Decimal } from "decimal.js";

/**
 * Factor & style return decomposition via ordinary least squares (OLS).
 *
 * Given a time series of portfolio **excess** returns (over the risk-free rate)
 * and a fixed set of factor return series, this regresses the portfolio onto
 * the factors:
 *
 *   rₜ = α + Σⱼ βⱼ · fⱼₜ + εₜ
 *
 * and reports, for each factor, its **beta** (the sensitivity/loading) and its
 * **contribution** to the portfolio's average return (βⱼ · mean(fⱼ)). The
 * intercept α is the average unexplained ("selection"/alpha) return, and the
 * model's **R²** measures the share of the portfolio's return variance the
 * factors explain.
 *
 * The OLS normal equations `(XᵀX) b = Xᵀy` are solved exactly in code with
 * Gauss-Jordan elimination on {@link Decimal}, so the result is deterministic
 * and free of floating-point drift. Nothing here moves money or trades — it is
 * a pure analytics function over fixture return series.
 *
 * The canonical factor set for a family-office multi-asset book is:
 *   - **market**        — broad equity beta
 *   - **size**          — small-minus-big (SMB)
 *   - **value**         — high-minus-low book/price (HML)
 *   - **rate-duration** — sensitivity to a level shift in rates (a duration / term factor)
 *   - **credit**        — credit spread (high-yield minus treasury)
 *   - **fx**            — trade-weighted currency factor
 */

/** The canonical, fixed factor set this engine regresses onto. */
export const FACTOR_KEYS = [
  "market",
  "size",
  "value",
  "rate-duration",
  "credit",
  "fx",
] as const;

export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  market: "Market",
  size: "Size (SMB)",
  value: "Value (HML)",
  "rate-duration": "Rate / Duration",
  credit: "Credit",
  fx: "FX",
};

/** A single observation: the factor returns for one period. */
export type FactorObservation = Record<FactorKey, Decimal.Value>;

export interface FactorRegressionInput {
  /**
   * Portfolio **excess** returns per period (decimal; 0.012 = +1.2%). Already
   * net of the risk-free rate so the intercept is a clean alpha.
   */
  portfolioExcessReturns: Decimal.Value[];
  /** Factor returns per period; aligned 1:1 with `portfolioExcessReturns`. */
  factors: FactorObservation[];
  /**
   * Whether to fit an intercept (alpha). Defaults to `true`. With no intercept
   * the regression is forced through the origin.
   */
  fitIntercept?: boolean;
}

/** Per-factor regression output. */
export interface FactorLoading {
  key: FactorKey;
  label: string;
  /** Regression coefficient βⱼ — the factor sensitivity / loading. */
  beta: Decimal;
  /** Mean factor return over the sample. */
  meanFactorReturn: Decimal;
  /** Contribution to mean portfolio return: βⱼ · mean(fⱼ). */
  contribution: Decimal;
}

export interface FactorRegressionResult {
  loadings: FactorLoading[];
  /** Intercept α (mean unexplained return). Zero when `fitIntercept` is false. */
  alpha: Decimal;
  /** Mean of the portfolio excess returns over the sample. */
  meanPortfolioReturn: Decimal;
  /** Σⱼ contributionⱼ — total return explained by the factors. */
  totalFactorContribution: Decimal;
  /** Coefficient of determination R² ∈ [0, 1] (can be <0 with no intercept). */
  rSquared: Decimal;
  /** R² adjusted for the number of regressors. */
  adjustedRSquared: Decimal;
  /** Residual standard error (sample standard deviation of residuals). */
  residualStdError: Decimal;
  /** Number of observations used. */
  observations: number;
  fitIntercept: boolean;
}

export class FactorRegressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactorRegressionError";
  }
}

const ZERO = new Decimal(0);

/**
 * Solve a linear system `A x = b` by Gauss-Jordan elimination with partial
 * pivoting, all in {@link Decimal}. `A` is `n × n` (row-major), `b` is length
 * `n`. Returns `x` of length `n`. Throws if the matrix is singular.
 */
function solveLinearSystem(A: Decimal[][], b: Decimal[]): Decimal[] {
  const n = b.length;
  // Build an augmented matrix [A | b] of fresh Decimals so we never mutate the
  // caller's arrays.
  const m: Decimal[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: pick the row (at or below col) with the largest |value|.
    let pivot = col;
    let pivotMag = m[col][col].abs();
    for (let r = col + 1; r < n; r++) {
      const mag = m[r][col].abs();
      if (mag.greaterThan(pivotMag)) {
        pivot = r;
        pivotMag = mag;
      }
    }
    if (pivotMag.isZero()) {
      throw new FactorRegressionError(
        "regression is singular: factors are collinear or there is too little data",
      );
    }
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }

    // Normalise the pivot row so the pivot element is 1.
    const pivotVal = m[col][col];
    for (let j = col; j <= n; j++) {
      m[col][j] = m[col][j].div(pivotVal);
    }

    // Eliminate the pivot column from every other row.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (factor.isZero()) continue;
      for (let j = col; j <= n; j++) {
        m[r][j] = m[r][j].minus(factor.times(m[col][j]));
      }
    }
  }

  return m.map((row) => row[n]);
}

/**
 * Run the OLS factor regression. Validates dimensions and finiteness, builds
 * the design matrix (a leading 1-column for the intercept when fitting one),
 * solves the normal equations exactly, and derives betas, contributions, R²,
 * and residual diagnostics.
 */
export function regressFactors(
  input: FactorRegressionInput,
): FactorRegressionResult {
  const fitIntercept = input.fitIntercept ?? true;
  const y = input.portfolioExcessReturns.map((v) => new Decimal(v));
  const rows = input.factors;
  const nObs = y.length;
  const nFactors = FACTOR_KEYS.length;

  if (nObs !== rows.length) {
    throw new FactorRegressionError(
      `mismatched lengths: ${nObs} portfolio returns vs ${rows.length} factor rows`,
    );
  }
  // Need at least as many observations as parameters (+1 for a meaningful fit).
  const nParams = nFactors + (fitIntercept ? 1 : 0);
  if (nObs <= nParams) {
    throw new FactorRegressionError(
      `need more observations (${nObs}) than parameters (${nParams})`,
    );
  }

  for (let i = 0; i < nObs; i++) {
    if (!y[i].isFinite()) {
      throw new FactorRegressionError(
        `portfolio return at index ${i} must be finite`,
      );
    }
  }

  // Design matrix X (nObs × nParams). Optional leading intercept column of 1s.
  const X: Decimal[][] = new Array(nObs);
  for (let i = 0; i < nObs; i++) {
    const row: Decimal[] = new Array(nParams);
    let c = 0;
    if (fitIntercept) {
      row[c++] = new Decimal(1);
    }
    for (let j = 0; j < nFactors; j++) {
      const key = FACTOR_KEYS[j];
      const raw = rows[i][key];
      if (raw === undefined) {
        throw new FactorRegressionError(
          `factor "${key}" missing at observation ${i}`,
        );
      }
      const v = new Decimal(raw);
      if (!v.isFinite()) {
        throw new FactorRegressionError(
          `factor "${key}" at observation ${i} must be finite`,
        );
      }
      row[c++] = v;
    }
    X[i] = row;
  }

  // Normal equations: XᵀX b = Xᵀy.
  const XtX: Decimal[][] = Array.from({ length: nParams }, () =>
    new Array(nParams).fill(ZERO),
  );
  const Xty: Decimal[] = new Array(nParams).fill(ZERO);
  for (let a = 0; a < nParams; a++) {
    for (let b2 = a; b2 < nParams; b2++) {
      let s = ZERO;
      for (let i = 0; i < nObs; i++) {
        s = s.plus(X[i][a].times(X[i][b2]));
      }
      XtX[a][b2] = s;
      XtX[b2][a] = s; // symmetric
    }
    let sy = ZERO;
    for (let i = 0; i < nObs; i++) {
      sy = sy.plus(X[i][a].times(y[i]));
    }
    Xty[a] = sy;
  }

  const coeffs = solveLinearSystem(XtX, Xty);

  let idx = 0;
  const alpha = fitIntercept ? coeffs[idx++] : ZERO;
  const betas: Decimal[] = FACTOR_KEYS.map(() => coeffs[idx++]);

  // Fitted values and residuals.
  const nDec = new Decimal(nObs);
  const meanY = y.reduce((s, v) => s.plus(v), ZERO).div(nDec);

  let ssRes = ZERO;
  let ssTot = ZERO;
  for (let i = 0; i < nObs; i++) {
    let fitted = alpha;
    for (let j = 0; j < nFactors; j++) {
      fitted = fitted.plus(betas[j].times(X[i][fitIntercept ? j + 1 : j]));
    }
    const resid = y[i].minus(fitted);
    ssRes = ssRes.plus(resid.times(resid));
    const dev = y[i].minus(meanY);
    ssTot = ssTot.plus(dev.times(dev));
  }

  // R² = 1 − SSres/SStot. With a zero-variance portfolio, define R² = 0.
  const rSquared = ssTot.isZero()
    ? ZERO
    : new Decimal(1).minus(ssRes.div(ssTot));

  // Adjusted R²: 1 − (1−R²)·(n−1)/(n−p), where p includes the intercept.
  const dfResid = nObs - nParams;
  const adjustedRSquared =
    dfResid > 0 && !ssTot.isZero()
      ? new Decimal(1).minus(
          new Decimal(1)
            .minus(rSquared)
            .times(nObs - 1)
            .div(dfResid),
        )
      : rSquared;

  // Residual standard error = sqrt(SSres / dfResid).
  const residualStdError =
    dfResid > 0 ? ssRes.div(dfResid).sqrt() : ZERO;

  // Mean factor returns and contributions (βⱼ · mean fⱼ).
  const loadings: FactorLoading[] = FACTOR_KEYS.map((key, j) => {
    let s = ZERO;
    for (let i = 0; i < nObs; i++) {
      s = s.plus(new Decimal(rows[i][key]));
    }
    const meanFactorReturn = s.div(nDec);
    const contribution = betas[j].times(meanFactorReturn);
    return {
      key,
      label: FACTOR_LABELS[key],
      beta: betas[j],
      meanFactorReturn,
      contribution,
    };
  });

  const totalFactorContribution = loadings.reduce(
    (s, l) => s.plus(l.contribution),
    ZERO,
  );

  return {
    loadings,
    alpha,
    meanPortfolioReturn: meanY,
    totalFactorContribution,
    rSquared,
    adjustedRSquared,
    residualStdError,
    observations: nObs,
    fitIntercept,
  };
}
