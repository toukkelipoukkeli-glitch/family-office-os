import { describe, expect, it, vi } from "vitest";

import { seededBoardReport } from "@/lib/reporting";

import { AiInsightsAdapter, type FetchLike } from "./client";
import {
  buildNarrativePrompt,
  deterministicNarrative,
  toPortfolioBrief,
} from "./prompt";
import {
  blockedResponse,
  emptyResponse,
  errorResponse,
  malformedResponse,
  multiPartResponse,
  successResponse,
} from "./fixtures";

/** Build a fetch stub that returns a fixture body with a given status. */
function fetchReturning(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): { fetchImpl: FetchLike; calls: { url: string; init?: unknown }[] } {
  const calls: { url: string; init?: unknown }[] = [];
  const fetchImpl: FetchLike = vi.fn(async (url, requestInit) => {
    calls.push({ url, init: requestInit });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: init.statusText ?? "OK",
      json: async () => body,
    };
  });
  return { fetchImpl, calls };
}

const KEY = "test-fixture-key";

describe("prompt builder", () => {
  it("distills the board report into a deterministic brief", () => {
    const brief = toPortfolioBrief(seededBoardReport);
    expect(brief.asOf).toBe(seededBoardReport.asOf);
    expect(brief.currency).toBe(seededBoardReport.currency);
    expect(brief.compliant).toBe(seededBoardReport.policy.compliant);
    expect(brief.breachCount).toBe(seededBoardReport.policy.breachCount);
    expect(brief.tvpi).toBe(`${seededBoardReport.privateMarkets.tvpi.toFixed(2)}×`);
    // Top holding is the largest allocation by value.
    expect(brief.topHolding).toContain(
      seededBoardReport.netWorth.byAssetClass[0].label,
    );
  });

  it("produces a stable prompt for the same report", () => {
    const a = buildNarrativePrompt(seededBoardReport);
    const b = buildNarrativePrompt(seededBoardReport);
    expect(a).toBe(b);
    expect(a).toContain("plain-English");
    expect(a).toContain("Do NOT give investment advice");
    expect(a).toContain(seededBoardReport.asOf);
  });

  it("never instructs the model to trade or move money", () => {
    const prompt = buildNarrativePrompt(seededBoardReport).toLowerCase();
    expect(prompt).toContain("not recommend any trades");
    expect(prompt).toContain("not give investment advice");
  });

  it("builds a deterministic offline narrative with the key facts", () => {
    const n = deterministicNarrative(seededBoardReport);
    expect(n).toContain(seededBoardReport.asOf);
    expect(n).toContain(seededBoardReport.currency);
    expect(deterministicNarrative(seededBoardReport)).toBe(n);
  });
});

describe("AiInsightsAdapter — fixture path", () => {
  it("returns an ok narrative from a successful fixture", async () => {
    const { fetchImpl, calls } = fetchReturning(successResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    expect(adapter.isConfigured).toBe(true);

    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.narrative).toBe(
        successResponse.candidates![0].content!.parts[0].text,
      );
      expect(result.model).toBe("gemini-1.5-flash");
      expect(result.deterministic).toBe(
        deterministicNarrative(seededBoardReport),
      );
    }

    // One POST to the generateContent endpoint with the key in the query.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(":generateContent");
    expect(calls[0].url).toContain(`key=${KEY}`);
    expect((calls[0].init as { method?: string }).method).toBe("POST");
  });

  it("concatenates multi-part candidate text", async () => {
    const { fetchImpl } = fetchReturning(multiPartResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.narrative).toBe(
        "The portfolio is in good standing. " +
          "Net worth grew and stayed within policy limits.",
      );
    }
  });

  it("does not leak the API key into request headers", async () => {
    const { fetchImpl, calls } = fetchReturning(successResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    await adapter.narrate(seededBoardReport);
    const headers = (calls[0].init as { headers?: Record<string, string> })
      .headers;
    expect(JSON.stringify(headers ?? {})).not.toContain(KEY);
  });
});

describe("AiInsightsAdapter — graceful degradation", () => {
  it("degrades when no API key is configured (never calls fetch)", async () => {
    const fetchImpl = vi.fn();
    const adapter = new AiInsightsAdapter({
      apiKey: "",
      fetchImpl: fetchImpl as unknown as FetchLike,
    });
    expect(adapter.isConfigured).toBe(false);

    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("missing-key");
      expect(result.deterministic).toBe(
        deterministicNarrative(seededBoardReport),
      );
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("degrades on an HTTP error and surfaces the Gemini message", async () => {
    const { fetchImpl } = fetchReturning(errorResponse, {
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });
    const adapter = new AiInsightsAdapter({ apiKey: "bad-key", fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("http-error");
      expect(result.detail).toContain("API key not valid");
      // The deterministic fallback is always present.
      expect(result.deterministic.length).toBeGreaterThan(0);
    }
  });

  it("degrades when the prompt is safety-blocked", async () => {
    const { fetchImpl } = fetchReturning(blockedResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("blocked");
      expect(result.detail).toContain("SAFETY");
    }
  });

  it("degrades when the response has no usable candidate text", async () => {
    const { fetchImpl } = fetchReturning(emptyResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("empty");
    }
  });

  it("degrades on a malformed body", async () => {
    const { fetchImpl } = fetchReturning(malformedResponse);
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("malformed");
    }
  });

  it("degrades on a network/throwing fetch", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("network-error");
      expect(result.detail).toContain("connection refused");
    }
  });

  it("never throws regardless of failure mode", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error("boom");
    });
    const adapter = new AiInsightsAdapter({ apiKey: KEY, fetchImpl });
    await expect(adapter.narrate(seededBoardReport)).resolves.toMatchObject({
      status: "unavailable",
    });
  });
});
