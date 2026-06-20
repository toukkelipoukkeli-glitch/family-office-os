import { describe, expect, it } from "vitest";

import { toJson } from "./json";

describe("toJson", () => {
  it("sorts object keys recursively for a canonical form", () => {
    const a = toJson({ b: 1, a: { z: 2, y: 3 } });
    const b = toJson({ a: { y: 3, z: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{\n  "a": {\n    "y": 3,\n    "z": 2\n  },\n  "b": 1\n}\n');
  });

  it("preserves array order while sorting nested object keys", () => {
    expect(toJson({ list: [{ b: 2, a: 1 }, { d: 4, c: 3 }] })).toBe(
      '{\n  "list": [\n    {\n      "a": 1,\n      "b": 2\n    },\n    {\n      "c": 3,\n      "d": 4\n    }\n  ]\n}\n',
    );
  });

  it("honours a value's own toJSON (e.g. a Money-like object)", () => {
    const moneyLike = { toJSON: () => ({ amount: "10.50", currency: "USD" }) };
    expect(toJson({ price: moneyLike })).toBe(
      '{\n  "price": {\n    "amount": "10.50",\n    "currency": "USD"\n  }\n}\n',
    );
  });

  it("appends a trailing newline and honours a custom indent", () => {
    expect(toJson({ a: 1 }, { indent: 0 })).toBe('{"a":1}\n');
  });

  it("can preserve insertion order when sortKeys is false", () => {
    expect(toJson({ b: 1, a: 2 }, { sortKeys: false, indent: 0 })).toBe(
      '{"b":1,"a":2}\n',
    );
  });

  it("throws on non-finite numbers in either mode", () => {
    expect(() => toJson({ x: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => toJson({ x: Number.NaN }, { sortKeys: false })).toThrow(
      /non-finite/,
    );
  });

  it("is deterministic", () => {
    const v = { z: [3, 1, 2], a: "x" };
    expect(toJson(v)).toBe(toJson(v));
  });
});
