import { describe, expect, it } from "vitest";

import { ASSET_CLASSES } from "../../model/asset-class";
import {
  ASSET_CLASS_CORRELATIONS,
  CORRELATION_RATIONALE,
  assumedCorrelation,
  correlationSubMatrix,
} from "./assumptions";
import {
  CorrelationMatrixError,
  checkCorrelationMatrix,
  isPositiveSemiDefinite,
  isSymmetric,
  nearestPositiveSemiDefinite,
  squareDimension,
} from "./matrix";

describe("matrix: squareDimension", () => {
  it("returns the dimension of a square finite matrix", () => {
    expect(squareDimension([[1]])).toBe(1);
    expect(
      squareDimension([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(2);
  });

  it("throws on an empty matrix", () => {
    expect(() => squareDimension([])).toThrow(CorrelationMatrixError);
  });

  it("throws on a non-square matrix", () => {
    expect(() => squareDimension([[1, 0]])).toThrow(/not square/);
  });

  it("throws on a non-finite entry", () => {
    expect(() =>
      squareDimension([
        [1, NaN],
        [NaN, 1],
      ]),
    ).toThrow(/non-finite/);
  });
});

describe("matrix: isSymmetric", () => {
  it("is true for an exactly symmetric matrix", () => {
    expect(
      isSymmetric([
        [1, 0.5],
        [0.5, 1],
      ]),
    ).toBe(true);
  });

  it("is false when the off-diagonal entries disagree", () => {
    expect(
      isSymmetric([
        [1, 0.5],
        [0.4, 1],
      ]),
    ).toBe(false);
  });

  it("tolerates differences within the tolerance", () => {
    expect(
      isSymmetric(
        [
          [1, 0.5],
          [0.5 + 1e-12, 1],
        ],
        1e-9,
      ),
    ).toBe(true);
  });
});

describe("matrix: isPositiveSemiDefinite", () => {
  it("accepts the identity matrix", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(true);
  });

  it("accepts a valid 2x2 correlation matrix", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 0.6],
        [0.6, 1],
      ]),
    ).toBe(true);
  });

  it("accepts a rank-deficient (perfectly correlated) PSD matrix", () => {
    // rho = 1 -> singular but still positive *semi*-definite (one zero eigenvalue).
    expect(
      isPositiveSemiDefinite([
        [1, 1],
        [1, 1],
      ]),
    ).toBe(true);
  });

  it("rejects an indefinite matrix (rho = 1.5)", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 1.5],
        [1.5, 1],
      ]),
    ).toBe(false);
  });

  it("rejects a classic inconsistent 3x3 set of pairwise correlations", () => {
    // A=B strong+, B=C strong+, but A=C strong- is internally inconsistent.
    expect(
      isPositiveSemiDefinite([
        [1, 0.9, -0.9],
        [0.9, 1, 0.9],
        [-0.9, 0.9, 1],
      ]),
    ).toBe(false);
  });

  it("accepts a known-PSD 3x3 matrix", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 0.5, 0.3],
        [0.5, 1, 0.4],
        [0.3, 0.4, 1],
      ]),
    ).toBe(true);
  });
});

describe("matrix: checkCorrelationMatrix", () => {
  it("passes a valid correlation matrix with no issues", () => {
    const res = checkCorrelationMatrix([
      [1, 0.4],
      [0.4, 1],
    ]);
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("flags a non-unit diagonal", () => {
    const res = checkCorrelationMatrix([
      [1, 0],
      [0, 0.9],
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues.some((m) => m.includes("diagonal"))).toBe(true);
  });

  it("flags an out-of-range off-diagonal entry", () => {
    const res = checkCorrelationMatrix([
      [1, 1.2],
      [1.2, 1],
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues.some((m) => m.includes("outside"))).toBe(true);
  });

  it("flags asymmetry", () => {
    const res = checkCorrelationMatrix([
      [1, 0.5],
      [0.2, 1],
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues).toContain("matrix is not symmetric");
  });

  it("flags a non-PSD matrix", () => {
    const res = checkCorrelationMatrix([
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues).toContain("matrix is not positive semi-definite");
  });

  it("reports a structural failure without throwing", () => {
    const res = checkCorrelationMatrix([[1, 0]]);
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });
});

describe("matrix: nearestPositiveSemiDefinite", () => {
  it("leaves an already-PSD matrix essentially unchanged", () => {
    const m = [
      [1, 0.5, 0.3],
      [0.5, 1, 0.4],
      [0.3, 0.4, 1],
    ];
    const repaired = nearestPositiveSemiDefinite(m);
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m.length; j++) {
        expect(repaired[i][j]).toBeCloseTo(m[i][j], 6);
      }
    }
  });

  it("repairs an inconsistent matrix into a valid PSD correlation matrix", () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    expect(isPositiveSemiDefinite(bad)).toBe(false);
    const fixed = nearestPositiveSemiDefinite(bad);
    const res = checkCorrelationMatrix(fixed);
    expect(res.ok).toBe(true);
    // unit diagonal preserved exactly
    for (let i = 0; i < fixed.length; i++) expect(fixed[i][i]).toBe(1);
  });

  it("throws on an asymmetric input", () => {
    expect(() =>
      nearestPositiveSemiDefinite([
        [1, 0.5],
        [0.2, 1],
      ]),
    ).toThrow(CorrelationMatrixError);
  });
});

describe("assumptions: ASSET_CLASS_CORRELATIONS", () => {
  it("covers every asset class in canonical order", () => {
    expect(ASSET_CLASS_CORRELATIONS.keys).toEqual([...ASSET_CLASSES]);
  });

  it("is square and matches the number of asset classes", () => {
    const n = ASSET_CLASS_CORRELATIONS.keys.length;
    expect(n).toBe(ASSET_CLASSES.length);
    expect(squareDimension(ASSET_CLASS_CORRELATIONS.matrix)).toBe(n);
  });

  it("has a unit diagonal", () => {
    const { matrix } = ASSET_CLASS_CORRELATIONS;
    for (let i = 0; i < matrix.length; i++) expect(matrix[i][i]).toBe(1);
  });

  it("is symmetric", () => {
    expect(isSymmetric(ASSET_CLASS_CORRELATIONS.matrix)).toBe(true);
  });

  it("has every off-diagonal entry within [-1, 1]", () => {
    const { matrix } = ASSET_CLASS_CORRELATIONS;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        if (i === j) continue;
        expect(matrix[i][j]).toBeGreaterThanOrEqual(-1);
        expect(matrix[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is positive semi-definite (internally consistent house view)", () => {
    expect(isPositiveSemiDefinite(ASSET_CLASS_CORRELATIONS.matrix)).toBe(true);
  });

  it("passes the full correlation-matrix check", () => {
    expect(checkCorrelationMatrix(ASSET_CLASS_CORRELATIONS.matrix).ok).toBe(true);
  });

  it("documents the key correlation blocks", () => {
    expect(CORRELATION_RATIONALE["equity:etf"]).toBeTruthy();
    expect(CORRELATION_RATIONALE["forest:vineyard"]).toBeTruthy();
    expect(CORRELATION_RATIONALE["wine:art"]).toBeTruthy();
    expect(CORRELATION_RATIONALE["car:watch"]).toBeTruthy();
  });
});

describe("assumptions: assumedCorrelation", () => {
  it("returns 1 on the diagonal", () => {
    for (const c of ASSET_CLASSES) {
      expect(assumedCorrelation(c, c)).toBe(1);
    }
  });

  it("is symmetric in its arguments", () => {
    expect(assumedCorrelation("equity", "etf")).toBe(
      assumedCorrelation("etf", "equity"),
    );
    expect(assumedCorrelation("wine", "art")).toBe(
      assumedCorrelation("art", "wine"),
    );
  });

  it("reflects the documented house view", () => {
    expect(assumedCorrelation("equity", "etf")).toBe(0.92);
    expect(assumedCorrelation("forest", "vineyard")).toBe(0.45);
    expect(assumedCorrelation("equity", "bond")).toBe(-0.1);
  });

  it("returns 0 for an unlisted (assumed-uncorrelated) pair", () => {
    expect(assumedCorrelation("cash", "crypto")).toBe(0);
  });
});

describe("assumptions: correlationSubMatrix", () => {
  it("extracts a sub-matrix preserving the requested order", () => {
    const sub = correlationSubMatrix(["wine", "art", "car"]);
    expect(sub.keys).toEqual(["wine", "art", "car"]);
    expect(sub.matrix[0][1]).toBe(assumedCorrelation("wine", "art"));
    expect(sub.matrix[1][2]).toBe(assumedCorrelation("art", "car"));
  });

  it("yields a valid correlation matrix for any subset", () => {
    const sub = correlationSubMatrix(["equity", "bond", "etf", "pe"]);
    const res = checkCorrelationMatrix(sub.matrix);
    expect(res.ok).toBe(true);
  });

  it("returns a 1x1 unit matrix for a single class", () => {
    const sub = correlationSubMatrix(["equity"]);
    expect(sub.matrix).toEqual([[1]]);
  });

  it("throws on an empty selection", () => {
    expect(() => correlationSubMatrix([])).toThrow(/at least one/);
  });

  it("throws on a duplicate class", () => {
    expect(() => correlationSubMatrix(["wine", "wine"])).toThrow(/duplicate/);
  });
});
