import { describe, expect, test } from "vitest";

import {
  ASSET_CLASSES as MODEL_ASSET_CLASSES,
  CONFIDENCE_LEVELS as MODEL_CONFIDENCE_LEVELS,
  VALUATION_SOURCES as MODEL_VALUATION_SOURCES,
} from "../src/lib/model";
import {
  ASSET_CLASSES,
  CONFIDENCE_LEVELS,
  VALUATION_SOURCES,
} from "./schema";

/**
 * The Convex schema duplicates the model's enums (it cannot import Zod into the
 * Convex runtime). These tests fail loudly if the two ever drift apart, keeping
 * the backend and the client model in lock-step.
 */
describe("convex schema mirrors the model enums", () => {
  test("asset classes match", () => {
    expect([...ASSET_CLASSES]).toEqual([...MODEL_ASSET_CLASSES]);
  });

  test("valuation sources match", () => {
    expect([...VALUATION_SOURCES]).toEqual([...MODEL_VALUATION_SOURCES]);
  });

  test("confidence levels match", () => {
    expect([...CONFIDENCE_LEVELS]).toEqual([...MODEL_CONFIDENCE_LEVELS]);
  });
});
