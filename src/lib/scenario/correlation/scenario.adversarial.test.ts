import { describe, expect, it } from "vitest";

import { ASSET_CLASSES } from "../../model/asset-class";
import {
  ASSET_CLASS_CORRELATIONS,
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

/**
 * Adversarial / edge-case coverage layered on top of scenario.test.ts. These
 * try to break the structural checks and the repair routine: degenerate sizes,
 * floating-point noise on boundaries, near-singular inputs, idempotence of the
 * repair, and full-house-view subset invariants. Everything stays deterministic
 * and offline.
 */

describe("adversarial: squareDimension", () => {
  it("throws on a ragged matrix where a later row is too long", () => {
    expect(() =>
      squareDimension([
        [1, 0],
        [0, 1, 0],
      ]),
    ).toThrow(/not square/);
  });

  it("throws on +Infinity and -Infinity entries", () => {
    expect(() => squareDimension([[Infinity]])).toThrow(/non-finite/);
    expect(() => squareDimension([[-Infinity]])).toThrow(/non-finite/);
  });

  it("accepts a large 1x1 finite matrix and reports dimension 1", () => {
    expect(squareDimension([[0.5]])).toBe(1);
  });
});

describe("adversarial: isSymmetric", () => {
  it("rejects a difference exactly above tolerance", () => {
    expect(
      isSymmetric(
        [
          [1, 0.5],
          [0.5 + 2e-9, 1],
        ],
        1e-9,
      ),
    ).toBe(false);
  });

  it("treats a 1x1 matrix as trivially symmetric", () => {
    expect(isSymmetric([[1]])).toBe(true);
  });

  it("propagates the squareDimension throw on a non-square input", () => {
    expect(() => isSymmetric([[1, 0]])).toThrow(CorrelationMatrixError);
  });
});

describe("adversarial: isPositiveSemiDefinite", () => {
  it("accepts a 1x1 unit matrix and rejects a 1x1 negative", () => {
    expect(isPositiveSemiDefinite([[1]])).toBe(true);
    expect(isPositiveSemiDefinite([[-0.5]])).toBe(false);
  });

  it("accepts a zero matrix (all eigenvalues zero -> PSD)", () => {
    expect(
      isPositiveSemiDefinite([
        [0, 0],
        [0, 0],
      ]),
    ).toBe(true);
  });

  it("rejects a matrix that is negative-definite (all pivots negative)", () => {
    expect(
      isPositiveSemiDefinite([
        [-1, 0],
        [0, -1],
      ]),
    ).toBe(false);
  });

  it("rejects a rank-deficient block with an inconsistent off-diagonal (zero-pivot path)", () => {
    // First two rows force a zero pivot at index 1; the [2][1] entry is then
    // inconsistent, so the singular-column consistency branch must reject it.
    expect(
      isPositiveSemiDefinite([
        [1, 1, 0],
        [1, 1, 0.5],
        [0, 0.5, 1],
      ]),
    ).toBe(false);
  });

  it("accepts a consistent rank-deficient 3x3 (duplicate variable)", () => {
    // Variable 0 and 1 identical, 2 correlated 0.5 to both: consistent + PSD.
    expect(
      isPositiveSemiDefinite([
        [1, 1, 0.5],
        [1, 1, 0.5],
        [0.5, 0.5, 1],
      ]),
    ).toBe(true);
  });
});

describe("adversarial: checkCorrelationMatrix", () => {
  it("collects multiple independent issues at once", () => {
    const res = checkCorrelationMatrix([
      [0.9, 2],
      [0.1, 0.8],
    ]);
    expect(res.ok).toBe(false);
    // non-unit diagonal (two of them), out-of-range entry, and asymmetry
    expect(res.issues.length).toBeGreaterThanOrEqual(3);
    expect(res.issues.some((m) => m.includes("diagonal"))).toBe(true);
    expect(res.issues.some((m) => m.includes("outside"))).toBe(true);
    expect(res.issues).toContain("matrix is not symmetric");
  });

  it("reports a non-finite entry as an issue without throwing", () => {
    const res = checkCorrelationMatrix([
      [1, NaN],
      [NaN, 1],
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues.some((m) => m.includes("non-finite"))).toBe(true);
  });

  it("accepts an entry exactly at the +1 / -1 boundary", () => {
    const res = checkCorrelationMatrix([
      [1, 1],
      [1, 1],
    ]);
    expect(res.ok).toBe(true);
    const res2 = checkCorrelationMatrix([
      [1, -1],
      [-1, 1],
    ]);
    expect(res2.ok).toBe(true);
  });
});

describe("adversarial: nearestPositiveSemiDefinite", () => {
  it("returns a symmetric, in-range, PSD matrix for a hostile inconsistent input", () => {
    const bad = [
      [1, 0.95, -0.95, 0.8],
      [0.95, 1, 0.7, -0.6],
      [-0.95, 0.7, 1, 0.9],
      [0.8, -0.6, 0.9, 1],
    ];
    expect(isPositiveSemiDefinite(bad)).toBe(false);
    const fixed = nearestPositiveSemiDefinite(bad);
    expect(isSymmetric(fixed)).toBe(true);
    expect(checkCorrelationMatrix(fixed).ok).toBe(true);
  });

  it("is idempotent: repairing an already-repaired matrix is a no-op", () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    const once = nearestPositiveSemiDefinite(bad);
    const twice = nearestPositiveSemiDefinite(once);
    for (let i = 0; i < once.length; i++) {
      for (let j = 0; j < once.length; j++) {
        expect(twice[i][j]).toBeCloseTo(once[i][j], 8);
      }
    }
  });

  it("handles a 1x1 matrix", () => {
    expect(nearestPositiveSemiDefinite([[1]])).toEqual([[1]]);
  });

  it("keeps the unit diagonal exactly even for a degenerate (all-equal) input", () => {
    const fixed = nearestPositiveSemiDefinite([
      [1, 1],
      [1, 1],
    ]);
    expect(fixed[0][0]).toBe(1);
    expect(fixed[1][1]).toBe(1);
    expect(checkCorrelationMatrix(fixed).ok).toBe(true);
  });

  it("throws on a non-finite input via squareDimension", () => {
    expect(() =>
      nearestPositiveSemiDefinite([
        [1, NaN],
        [NaN, 1],
      ]),
    ).toThrow(CorrelationMatrixError);
  });
});

describe("adversarial: assumptions house view", () => {
  it("every pairwise sub-matrix of the full house view is itself a valid correlation matrix", () => {
    // Random-but-deterministic walk over many subsets; each must stay valid.
    const classes = [...ASSET_CLASSES];
    for (let start = 0; start < classes.length; start++) {
      for (let len = 1; len <= classes.length - start; len++) {
        const subset = classes.slice(start, start + len);
        const sub = correlationSubMatrix(subset);
        expect(checkCorrelationMatrix(sub.matrix).ok).toBe(true);
      }
    }
  });

  it("assumedCorrelation agrees with the full matrix for every ordered pair", () => {
    const { keys, matrix } = ASSET_CLASS_CORRELATIONS;
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        expect(assumedCorrelation(ASSET_CLASSES[i], ASSET_CLASSES[j])).toBe(
          matrix[i][j],
        );
      }
    }
  });

  it("correlationSubMatrix preserves a reordered diagonal and symmetry", () => {
    const sub = correlationSubMatrix(["car", "wine", "art", "watch"]);
    for (let i = 0; i < sub.matrix.length; i++) {
      expect(sub.matrix[i][i]).toBe(1);
    }
    expect(isSymmetric(sub.matrix)).toBe(true);
  });

  it("every off-diagonal house-view entry is rounded to <= 2 decimals (no false precision)", () => {
    const { matrix } = ASSET_CLASS_CORRELATIONS;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        if (i === j) continue;
        const v = matrix[i][j];
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
      }
    }
  });
});
