import {
  regressFactors,
  type FactorKey,
  type FactorRegressionInput,
} from "./factors";

/**
 * Presentation view-model for the factor-attribution page: flattens the
 * {@link Decimal} regression result into plain numbers for charting and tabular
 * display. Pure and deterministic — derived entirely from {@link regressFactors}.
 */

export interface FactorRow {
  key: FactorKey;
  label: string;
  beta: number;
  meanFactorReturn: number;
  contribution: number;
}

export interface FactorView {
  loadings: FactorRow[];
  alpha: number;
  meanPortfolioReturn: number;
  totalFactorContribution: number;
  /** alpha + totalFactorContribution — equals meanPortfolioReturn up to rounding. */
  explainedTotal: number;
  rSquared: number;
  adjustedRSquared: number;
  residualStdError: number;
  observations: number;
  fitIntercept: boolean;
}

/** Build the plain-number view-model from a factor-regression input. */
export function buildFactorView(input: FactorRegressionInput): FactorView {
  const r = regressFactors(input);
  const alpha = r.alpha.toNumber();
  const totalFactorContribution = r.totalFactorContribution.toNumber();
  return {
    loadings: r.loadings.map((l) => ({
      key: l.key,
      label: l.label,
      beta: l.beta.toNumber(),
      meanFactorReturn: l.meanFactorReturn.toNumber(),
      contribution: l.contribution.toNumber(),
    })),
    alpha,
    meanPortfolioReturn: r.meanPortfolioReturn.toNumber(),
    totalFactorContribution,
    explainedTotal: alpha + totalFactorContribution,
    rSquared: r.rSquared.toNumber(),
    adjustedRSquared: r.adjustedRSquared.toNumber(),
    residualStdError: r.residualStdError.toNumber(),
    observations: r.observations,
    fitIntercept: r.fitIntercept,
  };
}
