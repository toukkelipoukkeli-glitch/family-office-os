import { describe, expect, it } from "vitest";

import { Money } from "../money";
import {
  buildBoard,
  dealAmount,
  effectiveProbability,
  findDeal,
  stageKindLabel,
  stageOf,
  summarizePipeline,
} from "./pipeline-board";
import {
  dealHarbor,
  dealSummit,
  sampleDeal,
  sampleDeals,
  samplePipeline,
  stageDiligence,
  stageSourced,
} from "./fixtures";

describe("effectiveProbability", () => {
  it("prefers the deal's own probability override", () => {
    // sampleDeal sits in diligence (default 0.5) but overrides to 0.55.
    expect(effectiveProbability(sampleDeal, stageDiligence)).toBe(0.55);
  });

  it("falls back to the stage default when the deal has no override", () => {
    // dealHarbor has no probability; sourced default is 0.1.
    expect(effectiveProbability(dealHarbor, stageSourced)).toBe(0.1);
  });

  it("clamps out-of-range values into [0, 1]", () => {
    const deal = { ...sampleDeal, probability: undefined };
    expect(effectiveProbability(deal, { ...stageSourced, probability: 1.5 })).toBe(
      1,
    );
    expect(
      effectiveProbability(deal, { ...stageSourced, probability: -0.2 }),
    ).toBe(0);
  });
});

describe("dealAmount", () => {
  it("parses an amount into Money", () => {
    const m = dealAmount(sampleDeal);
    expect(m).not.toBeNull();
    expect(m!.equals(Money.of("4500000.00", "EUR"))).toBe(true);
  });

  it("returns null when a deal has no amount", () => {
    expect(dealAmount({ ...sampleDeal, amount: undefined })).toBeNull();
  });
});

describe("buildBoard", () => {
  it("produces one column per stage, ordered by stage order", () => {
    const board = buildBoard(samplePipeline, sampleDeals);
    expect(board.map((c) => c.stage.id)).toEqual([
      "stage-sourced",
      "stage-diligence",
      "stage-negotiation",
      "stage-won",
      "stage-lost",
    ]);
  });

  it("groups deals into the column matching their stageId", () => {
    const board = buildBoard(samplePipeline, sampleDeals);
    const byId = new Map(board.map((c) => [c.stage.id, c]));
    expect(byId.get("stage-sourced")!.deals.map((d) => d.id)).toEqual([
      "deal-harbor",
    ]);
    expect(byId.get("stage-diligence")!.deals.map((d) => d.id)).toEqual([
      "deal-acorn",
    ]);
    expect(byId.get("stage-negotiation")!.deals.map((d) => d.id)).toEqual([
      "deal-summit",
    ]);
    expect(byId.get("stage-won")!.count).toBe(1);
    expect(byId.get("stage-lost")!.count).toBe(1);
  });

  it("sums column totals exactly (no float drift)", () => {
    const board = buildBoard(samplePipeline, sampleDeals);
    const negotiation = board.find((c) => c.stage.id === "stage-negotiation")!;
    // Single deal Summit at 8,750,000.
    expect(negotiation.total.equals(Money.of("8750000", "EUR"))).toBe(true);
    // Weighted at the deal override of 0.7 => 6,125,000.
    expect(negotiation.weighted.equals(Money.of("6125000", "EUR"))).toBe(true);
  });

  it("reports a zero total for an empty stage", () => {
    const board = buildBoard(samplePipeline, [sampleDeal]);
    const sourced = board.find((c) => c.stage.id === "stage-sourced")!;
    expect(sourced.count).toBe(0);
    expect(sourced.total.isZero()).toBe(true);
    expect(sourced.weighted.isZero()).toBe(true);
  });

  it("ignores deals whose stageId is not in the pipeline", () => {
    const stray = { ...sampleDeal, id: "stray", stageId: "no-such-stage" };
    const board = buildBoard(samplePipeline, [stray]);
    expect(board.every((c) => c.count === 0)).toBe(true);
  });
});

describe("summarizePipeline", () => {
  it("counts open vs closed deals", () => {
    const s = summarizePipeline(samplePipeline, sampleDeals);
    // acorn, harbor, summit are active; meadow won, quarry lost.
    expect(s.openCount).toBe(3);
    expect(s.closedCount).toBe(2);
    expect(s.wonCount).toBe(1);
    expect(s.lostCount).toBe(1);
  });

  it("totals only open deals for the forward pipeline", () => {
    const s = summarizePipeline(samplePipeline, sampleDeals);
    // 4,500,000 (acorn) + 2,200,000 (harbor) + 8,750,000 (summit).
    expect(s.openTotal.equals(Money.of("15450000", "EUR"))).toBe(true);
  });

  it("computes the probability-weighted expected value of open deals", () => {
    const s = summarizePipeline(samplePipeline, sampleDeals);
    // acorn 4,500,000 * 0.55 = 2,475,000
    // harbor 2,200,000 * 0.10 (stage default) = 220,000
    // summit 8,750,000 * 0.70 = 6,125,000
    // total = 8,820,000
    expect(s.weightedTotal.equals(Money.of("8820000", "EUR"))).toBe(true);
  });

  it("computes win rate over decided deals", () => {
    const s = summarizePipeline(samplePipeline, sampleDeals);
    // 1 won / (1 won + 1 lost) = 0.5
    expect(s.winRate).toBe(0.5);
  });

  it("returns null win rate when nothing is decided yet", () => {
    const openOnly = sampleDeals.filter((d) => d.status === "active");
    const s = summarizePipeline(samplePipeline, openOnly);
    expect(s.winRate).toBeNull();
  });

  it("ignores deals from a different pipeline", () => {
    const other = { ...dealSummit, id: "other", pipelineId: "pipeline-x" };
    const s = summarizePipeline(samplePipeline, [...sampleDeals, other]);
    expect(s.openCount).toBe(3); // unchanged
  });
});

describe("lookups", () => {
  it("findDeal returns the matching deal", () => {
    expect(findDeal(sampleDeals, "deal-summit")?.name).toContain("Summit");
    expect(findDeal(sampleDeals, "nope")).toBeUndefined();
  });

  it("stageOf resolves a deal's stage", () => {
    expect(stageOf(samplePipeline, sampleDeal)?.id).toBe("stage-diligence");
    expect(stageOf(samplePipeline, dealHarbor)?.id).toBe("stage-sourced");
  });

  it("stageKindLabel maps every kind", () => {
    expect(stageKindLabel("open")).toBe("Open");
    expect(stageKindLabel("won")).toBe("Won");
    expect(stageKindLabel("lost")).toBe("Lost");
  });
});
