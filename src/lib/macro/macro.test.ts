import { describe, expect, it, vi } from "vitest";

import { yearOverYearChange } from "./analysis";
import {
  FRED_BASE_URL,
  FredHttpError,
  MacroAdapter,
  MissingApiKeyError,
  buildObservationsUrl,
  type FetchLike,
  type FetchResponseLike,
} from "./client";
import {
  FRED_MISSING_VALUE,
  FredObservationsResponse,
  parseFredObservations,
} from "./fred-response";
import { fredCpiRaw, fredDgs10Raw, fredErrorRaw } from "./fixtures";
import {
  MACRO_SERIES,
  MACRO_SERIES_KEYS,
  MacroObservation,
  MacroSeries,
  latestObservation,
} from "./series";

/** Build a fake fetch that returns the given payload with a chosen status. */
function fakeFetch(
  payload: unknown,
  { ok = true, status = 200, statusText = "OK" } = {},
): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const res: FetchResponseLike = {
    ok,
    status,
    statusText,
    json: async () => payload,
  };
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      return res;
    },
  };
}

describe("series catalog", () => {
  it("maps DGS10 and CPI to the right FRED ids", () => {
    expect(MACRO_SERIES.dgs10.fredId).toBe("DGS10");
    expect(MACRO_SERIES.cpi.fredId).toBe("CPIAUCSL");
    expect(MACRO_SERIES_KEYS).toEqual(["dgs10", "cpi"]);
  });
});

describe("parseFredObservations", () => {
  it("parses DGS10, dropping missing values and keeping ascending order", () => {
    const series = parseFredObservations("dgs10", fredDgs10Raw);

    expect(series.key).toBe("dgs10");
    expect(series.fredId).toBe("DGS10");
    expect(series.unit).toBe("percent");
    expect(series.frequency).toBe("daily");

    // Two "." rows dropped: 9 raw → 7 observations.
    expect(series.observations).toHaveLength(7);
    expect(series.observations.every((o) => o.value !== FRED_MISSING_VALUE)).toBe(
      true,
    );

    // Strictly ascending by date.
    const dates = series.observations.map((o) => o.date);
    expect(dates).toEqual([...dates].sort());

    expect(latestObservation(series)).toEqual({
      date: "2026-06-12",
      value: "4.28",
    });
  });

  it("sorts an out-of-order CPI payload ascending", () => {
    const series = parseFredObservations("cpi", fredCpiRaw);
    expect(series.observations).toHaveLength(13);

    const dates = series.observations.map((o) => o.date);
    expect(dates[0]).toBe("2025-05-01");
    expect(dates.at(-1)).toBe("2026-05-01");
    expect(dates).toEqual([...dates].sort());
  });

  it("re-validates output as a MacroSeries (no missing, sorted, strict)", () => {
    const series = parseFredObservations("dgs10", fredDgs10Raw);
    // Round-trips cleanly through the domain schema.
    expect(() => MacroSeries.parse(series)).not.toThrow();
  });

  it("rejects a malformed value via the domain schema", () => {
    expect(() =>
      parseFredObservations("dgs10", {
        observations: [{ date: "2026-06-01", value: "not-a-number" }],
      }),
    ).toThrow();
  });

  it("rejects a malformed (non-calendar) date", () => {
    expect(() =>
      parseFredObservations("dgs10", {
        observations: [{ date: "2026-02-30", value: "4.31" }],
      }),
    ).toThrow();
  });

  it("rejects a payload missing the observations array", () => {
    expect(() => FredObservationsResponse.parse({})).toThrow();
  });

  it("handles an all-missing payload as an empty series", () => {
    const series = parseFredObservations("dgs10", {
      observations: [
        { date: "2026-06-06", value: "." },
        { date: "2026-06-07", value: "." },
      ],
    });
    expect(series.observations).toEqual([]);
    expect(latestObservation(series)).toBeUndefined();
  });
});

describe("MacroObservation schema", () => {
  it("rejects unknown keys (strict)", () => {
    expect(() =>
      MacroObservation.parse({ date: "2026-06-01", value: "4.31", extra: 1 }),
    ).toThrow();
  });
});

describe("MacroSeries schema", () => {
  it("rejects non-ascending observations", () => {
    expect(() =>
      MacroSeries.parse({
        key: "dgs10",
        fredId: "DGS10",
        name: "x",
        unit: "percent",
        frequency: "daily",
        observations: [
          { date: "2026-06-03", value: "4.34" },
          { date: "2026-06-01", value: "4.31" },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate dates", () => {
    expect(() =>
      MacroSeries.parse({
        key: "cpi",
        fredId: "CPIAUCSL",
        name: "x",
        unit: "index_1982_1984_100",
        frequency: "monthly",
        observations: [
          { date: "2026-05-01", value: "320.601" },
          { date: "2026-05-01", value: "320.601" },
        ],
      }),
    ).toThrow();
  });
});

describe("buildObservationsUrl", () => {
  it("builds a FRED url with series_id, api_key and file_type", () => {
    const url = buildObservationsUrl("cpi", "SECRET_KEY");
    expect(url.startsWith(`${FRED_BASE_URL}/series/observations?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("series_id")).toBe("CPIAUCSL");
    expect(params.get("api_key")).toBe("SECRET_KEY");
    expect(params.get("file_type")).toBe("json");
  });

  it("includes an observation window when provided", () => {
    const url = buildObservationsUrl("dgs10", "k", {
      observationStart: "2026-01-01",
      observationEnd: "2026-06-12",
    });
    const params = new URL(url).searchParams;
    expect(params.get("observation_start")).toBe("2026-01-01");
    expect(params.get("observation_end")).toBe("2026-06-12");
  });
});

describe("MacroAdapter", () => {
  it("throws MissingApiKeyError when no key is provided", () => {
    const prev = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      expect(() => new MacroAdapter({ fetch: fakeFetch({}).fetch })).toThrow(
        MissingApiKeyError,
      );
    } finally {
      if (prev !== undefined) process.env.FRED_API_KEY = prev;
    }
  });

  it("falls back to FRED_API_KEY from the environment", async () => {
    const { fetch, calls } = fakeFetch(fredDgs10Raw);
    const prev = process.env.FRED_API_KEY;
    process.env.FRED_API_KEY = "env-key";
    try {
      const adapter = new MacroAdapter({ fetch });
      await adapter.fetchTenYearRate();
      expect(calls[0]).toContain("api_key=env-key");
    } finally {
      if (prev === undefined) delete process.env.FRED_API_KEY;
      else process.env.FRED_API_KEY = prev;
    }
  });

  it("fetches and parses the 10-year rate (DGS10) offline", async () => {
    const { fetch, calls } = fakeFetch(fredDgs10Raw);
    const adapter = new MacroAdapter({ apiKey: "k", fetch });
    const series = await adapter.fetchTenYearRate();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("series_id=DGS10");
    expect(series.fredId).toBe("DGS10");
    expect(latestObservation(series)?.value).toBe("4.28");
  });

  it("fetches and parses CPI (CPIAUCSL) offline", async () => {
    const { fetch } = fakeFetch(fredCpiRaw);
    const adapter = new MacroAdapter({ apiKey: "k", fetch });
    const series = await adapter.fetchCpi();
    expect(series.fredId).toBe("CPIAUCSL");
    expect(series.observations).toHaveLength(13);
  });

  it("passes an observation window through to the request url", async () => {
    const { fetch, calls } = fakeFetch(fredCpiRaw);
    const adapter = new MacroAdapter({ apiKey: "k", fetch });
    await adapter.fetchCpi({
      observationStart: "2025-05-01",
      observationEnd: "2026-05-01",
    });
    expect(calls[0]).toContain("observation_start=2025-05-01");
    expect(calls[0]).toContain("observation_end=2026-05-01");
  });

  it("throws FredHttpError on a non-2xx response", async () => {
    const { fetch } = fakeFetch(fredErrorRaw, {
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });
    const adapter = new MacroAdapter({ apiKey: "bad", fetch });
    await expect(adapter.fetchCpi()).rejects.toBeInstanceOf(FredHttpError);
    await expect(adapter.fetchCpi()).rejects.toMatchObject({ status: 400 });
  });

  it("forwards an abort signal to fetch", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fredDgs10Raw,
    }));
    const adapter = new MacroAdapter({
      apiKey: "k",
      fetch: spy as unknown as FetchLike,
    });
    const controller = new AbortController();
    await adapter.fetchTenYearRate(undefined, { signal: controller.signal });
    expect(spy).toHaveBeenCalledWith(expect.any(String), {
      signal: controller.signal,
    });
  });

  it("never requests anything outside the FRED base url", async () => {
    const { fetch, calls } = fakeFetch(fredDgs10Raw);
    const adapter = new MacroAdapter({ apiKey: "k", fetch });
    await adapter.fetchTenYearRate();
    await adapter.fetchCpi();
    expect(calls).toHaveLength(2);
    expect(calls.every((u) => u.startsWith(FRED_BASE_URL))).toBe(true);
  });
});

describe("yearOverYearChange", () => {
  it("computes YoY CPI change exactly via decimal arithmetic", () => {
    const series = parseFredObservations("cpi", fredCpiRaw);
    // latest 2026-05 = 320.601, prior 2025-05 = 310.326.
    // (320.601 - 310.326) / 310.326 * 100 = 3.31096... → 3.31
    expect(yearOverYearChange(series)).toBe("3.31");
  });

  it("respects the requested decimal places", () => {
    const series = parseFredObservations("cpi", fredCpiRaw);
    expect(yearOverYearChange(series, 4)).toBe("3.311");
  });

  it("returns undefined when there is no observation 12 months prior", () => {
    const series = parseFredObservations("cpi", {
      observations: [{ date: "2026-05-01", value: "320.601" }],
    });
    expect(yearOverYearChange(series)).toBeUndefined();
  });

  it("returns undefined for an empty series", () => {
    const series = parseFredObservations("cpi", { observations: [] });
    expect(yearOverYearChange(series)).toBeUndefined();
  });
});
