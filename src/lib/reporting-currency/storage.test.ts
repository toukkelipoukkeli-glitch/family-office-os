import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REPORTING_CURRENCY } from "./reporting-currency";
import {
  REPORTING_CURRENCY_STORAGE_KEY,
  readStoredReportingCurrency,
  writeStoredReportingCurrency,
} from "./storage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("reporting-currency storage", () => {
  it("returns the default when nothing is stored", () => {
    expect(readStoredReportingCurrency()).toBe(DEFAULT_REPORTING_CURRENCY);
  });

  it("round-trips a supported currency", () => {
    writeStoredReportingCurrency("EUR");
    expect(localStorage.getItem(REPORTING_CURRENCY_STORAGE_KEY)).toBe("EUR");
    expect(readStoredReportingCurrency()).toBe("EUR");
  });

  it("normalizes case on write", () => {
    writeStoredReportingCurrency("gbp");
    expect(readStoredReportingCurrency()).toBe("GBP");
  });

  it("normalizes an unsupported stored value to the default on read", () => {
    localStorage.setItem(REPORTING_CURRENCY_STORAGE_KEY, "JPY");
    expect(readStoredReportingCurrency()).toBe(DEFAULT_REPORTING_CURRENCY);
  });

  it("normalizes an unsupported value to the default on write", () => {
    writeStoredReportingCurrency("XYZ");
    expect(localStorage.getItem(REPORTING_CURRENCY_STORAGE_KEY)).toBe(
      DEFAULT_REPORTING_CURRENCY,
    );
  });

  it("degrades to the default when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredReportingCurrency()).toBe(DEFAULT_REPORTING_CURRENCY);
  });

  it("no-ops when setItem throws (e.g. quota / privacy mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeStoredReportingCurrency("EUR")).not.toThrow();
  });
});
