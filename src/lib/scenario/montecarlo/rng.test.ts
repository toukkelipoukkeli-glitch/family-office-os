import { describe, expect, it } from "vitest";

import {
  applyLowerTriangular,
  choleskyLower,
  Mulberry32,
  RngError,
  splitMix32,
} from "./rng";

describe("splitMix32", () => {
  it("is deterministic for a given state", () => {
    expect(splitMix32(0).value).toBe(splitMix32(0).value);
    expect(splitMix32(123).value).toBe(splitMix32(123).value);
  });

  it("produces different values for adjacent states", () => {
    expect(splitMix32(0).value).not.toBe(splitMix32(1).value);
  });

  it("returns unsigned 32-bit values", () => {
    for (const s of [0, 1, 42, 1 << 30]) {
      const { value } = splitMix32(s);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("Mulberry32: determinism", () => {
  it("yields identical uniform streams for the same seed", () => {
    const a = new Mulberry32(7);
    const b = new Mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("yields different streams for different seeds", () => {
    const a = new Mulberry32(1);
    const b = new Mulberry32(2);
    const aa = Array.from({ length: 50 }, () => a.next());
    const bb = Array.from({ length: 50 }, () => b.next());
    expect(aa).not.toEqual(bb);
  });

  it("truncates and folds non-integer / negative seeds into the 32-bit range", () => {
    // Same effective seed after truncation+fold -> identical stream.
    const a = new Mulberry32(5);
    const b = new Mulberry32(5.9);
    expect(a.next()).toBe(b.next());
  });

  it("throws on a non-finite seed", () => {
    expect(() => new Mulberry32(NaN)).toThrow(RngError);
    expect(() => new Mulberry32(Infinity)).toThrow(RngError);
  });
});

describe("Mulberry32: uniform distribution", () => {
  it("stays within [0, 1)", () => {
    const rng = new Mulberry32(99);
    for (let i = 0; i < 10_000; i++) {
      const u = rng.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("has a mean near 0.5 and variance near 1/12 over many draws", () => {
    const rng = new Mulberry32(2024);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const u = rng.next();
      sum += u;
      sumSq += u * u;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeCloseTo(0.5, 2);
    expect(variance).toBeCloseTo(1 / 12, 2);
  });
});

describe("Mulberry32: Gaussian draws", () => {
  it("is deterministic for a given seed", () => {
    const a = new Mulberry32(3);
    const b = new Mulberry32(3);
    for (let i = 0; i < 50; i++) {
      expect(a.nextGaussian()).toBe(b.nextGaussian());
    }
  });

  it("has approximately zero mean and unit variance over many draws", () => {
    const rng = new Mulberry32(555);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const g = rng.nextGaussian();
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(variance).toBeCloseTo(1, 1);
  });

  it("is roughly symmetric (≈ half the draws are negative)", () => {
    const rng = new Mulberry32(8);
    const n = 100_000;
    let neg = 0;
    for (let i = 0; i < n; i++) {
      if (rng.nextGaussian() < 0) neg++;
    }
    expect(neg / n).toBeCloseTo(0.5, 1);
  });

  it("gaussianVector returns the requested length and matches sequential draws", () => {
    const a = new Mulberry32(11);
    const b = new Mulberry32(11);
    const vec = a.gaussianVector(4);
    expect(vec).toHaveLength(4);
    expect(vec).toEqual([
      b.nextGaussian(),
      b.nextGaussian(),
      b.nextGaussian(),
      b.nextGaussian(),
    ]);
  });

  it("throws on a bad gaussianVector length", () => {
    const rng = new Mulberry32(1);
    expect(() => rng.gaussianVector(-1)).toThrow(RngError);
    expect(() => rng.gaussianVector(1.5)).toThrow(RngError);
  });
});

describe("choleskyLower", () => {
  it("factors the identity into the identity", () => {
    const l = choleskyLower([
      [1, 0],
      [0, 1],
    ]);
    expect(l).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("reconstructs A = L Lᵀ for a valid correlation matrix", () => {
    const a = [
      [1, 0.5, 0.3],
      [0.5, 1, 0.4],
      [0.3, 0.4, 1],
    ];
    const l = choleskyLower(a);
    const n = a.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += l[i][k] * l[j][k];
        expect(s).toBeCloseTo(a[i][j], 9);
      }
    }
    // Lower triangular: strictly-upper entries are zero.
    expect(l[0][1]).toBe(0);
    expect(l[0][2]).toBe(0);
    expect(l[1][2]).toBe(0);
  });

  it("handles a rank-deficient PSD matrix (rho = 1) with a zero pivot", () => {
    const l = choleskyLower([
      [1, 1],
      [1, 1],
    ]);
    // Reconstruct: should recover the original.
    const recon = [
      [l[0][0] * l[0][0], l[0][0] * l[1][0]],
      [l[1][0] * l[0][0], l[1][0] * l[1][0] + l[1][1] * l[1][1]],
    ];
    expect(recon[0][0]).toBeCloseTo(1, 9);
    expect(recon[0][1]).toBeCloseTo(1, 9);
    expect(recon[1][1]).toBeCloseTo(1, 9);
  });

  it("throws on a non-PSD (indefinite) matrix", () => {
    expect(() =>
      choleskyLower([
        [1, 1.5],
        [1.5, 1],
      ]),
    ).toThrow(RngError);
  });

  it("throws on a non-square matrix", () => {
    expect(() => choleskyLower([[1, 0]])).toThrow(RngError);
  });

  it("throws on an empty matrix", () => {
    expect(() => choleskyLower([])).toThrow(RngError);
  });
});

describe("applyLowerTriangular", () => {
  it("computes L z", () => {
    const l = [
      [2, 0],
      [1, 3],
    ];
    expect(applyLowerTriangular(l, [1, 1])).toEqual([2, 4]);
  });

  it("throws on a dimension mismatch", () => {
    expect(() => applyLowerTriangular([[1]], [1, 2])).toThrow(RngError);
  });

  it("produces correlated normals with the requested correlation", () => {
    // Build correlated draws e = L z and check the empirical correlation.
    const corr = [
      [1, 0.7],
      [0.7, 1],
    ];
    const l = choleskyLower(corr);
    const rng = new Mulberry32(4242);
    const n = 200_000;
    let s0 = 0;
    let s1 = 0;
    let s00 = 0;
    let s11 = 0;
    let s01 = 0;
    for (let i = 0; i < n; i++) {
      const e = applyLowerTriangular(l, rng.gaussianVector(2));
      s0 += e[0];
      s1 += e[1];
      s00 += e[0] * e[0];
      s11 += e[1] * e[1];
      s01 += e[0] * e[1];
    }
    const m0 = s0 / n;
    const m1 = s1 / n;
    const v0 = s00 / n - m0 * m0;
    const v1 = s11 / n - m1 * m1;
    const cov = s01 / n - m0 * m1;
    const rho = cov / Math.sqrt(v0 * v1);
    expect(rho).toBeCloseTo(0.7, 1);
    expect(v0).toBeCloseTo(1, 1);
    expect(v1).toBeCloseTo(1, 1);
  });
});
