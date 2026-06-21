import { describe, expect, it, vi } from "vitest";

import { seededBoardReport } from "@/lib/reporting";

import {
  AiInsightsAdapter,
  GEMINI_BASE_URL,
  type FetchLike,
} from "./client";
import {
  LIVE_PROVIDER_HOSTS,
  LiveCallBlockedError,
  guardLiveCall,
  isBrowserRuntime,
  isLiveProviderUrl,
} from "./guard";

describe("no-live-call guard — host classification", () => {
  it("flags every configured live provider host", () => {
    for (const host of LIVE_PROVIDER_HOSTS) {
      expect(isLiveProviderUrl(`https://${host}/some/path?x=1`)).toBe(true);
    }
  });

  it("flags subdomains of a live provider host", () => {
    expect(isLiveProviderUrl("https://eu.api.tavily.com/search")).toBe(true);
    expect(
      isLiveProviderUrl("https://foo.generativelanguage.googleapis.com/v1"),
    ).toBe(true);
  });

  it("treats the real Gemini base URL as a live host", () => {
    expect(isLiveProviderUrl(GEMINI_BASE_URL)).toBe(true);
  });

  it("does NOT flag same-origin or unrelated hosts", () => {
    expect(isLiveProviderUrl("/api/local")).toBe(false);
    expect(isLiveProviderUrl("https://example.test/x")).toBe(false);
    expect(isLiveProviderUrl("https://localhost:5173/#/insights")).toBe(false);
    // A look-alike host that merely contains the provider name is not matched.
    expect(isLiveProviderUrl("https://tavily.com.evil.test/x")).toBe(false);
  });

  it("does not throw on an unparseable URL", () => {
    expect(isLiveProviderUrl("::::not a url::::")).toBe(false);
  });

  it("matches regardless of host casing", () => {
    expect(
      isLiveProviderUrl("https://GenerativeLanguage.GoogleAPIs.com/v1"),
    ).toBe(true);
  });

  it("a trailing-dot FQDN cannot bypass the guard", () => {
    // `host.example.com.` resolves to the identical live host, so it must still
    // be flagged — otherwise a single trailing dot would defeat the block.
    expect(
      isLiveProviderUrl("https://generativelanguage.googleapis.com./v1"),
    ).toBe(true);
    expect(isLiveProviderUrl("https://api.tavily.com./search")).toBe(true);
    expect(
      guardLiveCall("https://api.tavily.com./search", { isBrowser: true })
        .allow,
    ).toBe(false);
  });

  it("matches a live host on an explicit port", () => {
    expect(isLiveProviderUrl("https://api.tavily.com:443/search")).toBe(true);
  });
});

describe("no-live-call guard — decision", () => {
  it("blocks live provider calls in a browser runtime", () => {
    const d = guardLiveCall("https://generativelanguage.googleapis.com/v1", {
      isBrowser: true,
    });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("browser-live-host");
  });

  it("allows live provider calls server-side (no browser)", () => {
    const d = guardLiveCall("https://generativelanguage.googleapis.com/v1", {
      isBrowser: false,
    });
    expect(d.allow).toBe(true);
  });

  it("allows non-provider calls even in a browser", () => {
    const d = guardLiveCall("/local/data.json", { isBrowser: true });
    expect(d.allow).toBe(true);
  });

  it("exposes a descriptive blocked-call error with the host", () => {
    const err = new LiveCallBlockedError(
      "https://www.alphavantage.co/query?function=X",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LiveCallBlockedError");
    expect(err.message).toContain("alphavantage.co");
  });

  it("detects the jsdom runtime as a browser (guard is active in tests)", () => {
    // The unit suite runs under jsdom, so the guard must consider itself "in a
    // browser" — this is what proves the guard would fire in production too.
    expect(isBrowserRuntime()).toBe(true);
  });
});

/**
 * THE ORACLE for m14-no-key-guard: in the client/browser path, the AI adapter
 * makes NO live network call. This holds both when no key is present and even
 * if a key were injected into the client.
 */
describe("AiInsightsAdapter — no live network call from the client", () => {
  it("makes NO fetch when no key is configured (browser path)", async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike;
    const adapter = new AiInsightsAdapter({
      apiKey: "",
      fetchImpl,
      isBrowser: true,
    });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("missing-key");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes NO live fetch even if a key leaks into the browser bundle", async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike;
    const adapter = new AiInsightsAdapter({
      apiKey: "leaked-client-key",
      fetchImpl,
      isBrowser: true,
    });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("browser-blocked");
      // The deterministic fallback is always present.
      expect(result.deterministic.length).toBeGreaterThan(0);
    }
    // The guard fired before any network call.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the only fetch the adapter ever issues targets a live provider host", async () => {
    // Server-side (isBrowser: false) the live call IS allowed — and when it
    // happens, its URL is one the guard would block in the browser. This proves
    // the guard's host list actually covers the adapter's real endpoint.
    const calls: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "ok" }] } }],
        }),
      };
    });
    const adapter = new AiInsightsAdapter({
      apiKey: "server-key",
      fetchImpl,
      isBrowser: false,
    });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(isLiveProviderUrl(calls[0])).toBe(true);
    expect(guardLiveCall(calls[0], { isBrowser: true }).allow).toBe(false);
  });

  it("default construction in jsdom blocks the live call without an explicit override", async () => {
    // No `isBrowser` passed → uses runtime detection → jsdom → browser → blocked.
    const fetchImpl = vi.fn() as unknown as FetchLike;
    const adapter = new AiInsightsAdapter({
      apiKey: "leaked-client-key",
      fetchImpl,
    });
    const result = await adapter.narrate(seededBoardReport);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("browser-blocked");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
