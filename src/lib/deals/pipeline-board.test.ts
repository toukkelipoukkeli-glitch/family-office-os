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

describe("summarizePipeline edge cases (adversarial)", () => {
  it("counts abandoned deals as closed but excludes them from win rate", () => {
    // An abandoned deal is terminal (closed) but is neither a win nor a loss,
    // so it must not enter the win-rate denominator.
    const abandoned = {
      ...dealSummit,
      id: "deal-abandoned",
      status: "abandoned" as const,
    };
    const s = summarizePipeline(samplePipeline, [...sampleDeals, abandoned]);
    expect(s.closedCount).toBe(3); // meadow(won) + quarry(lost) + abandoned
    expect(s.wonCount).toBe(1);
    expect(s.lostCount).toBe(1);
    // Denominator stays won+lost = 2, so win rate is unchanged at 0.5.
    expect(s.winRate).toBe(0.5);
  });

  it("does not float-drift the weighted total across many odd-cent deals", () => {
    // 3 open deals at 1,000,000.01 each with p=0.333 should give an exact
    // Money sum with no binary-float residue.
    const odd = [0, 1, 2].map((i) => ({
      ...dealSummit,
      id: `odd-${i}`,
      status: "active" as const,
      stageId: "stage-negotiation",
      amount: { amount: "1000000.01", currency: "EUR" },
      probability: 0.333,
    }));
    const s = summarizePipeline(samplePipeline, odd);
    // 1,000,000.01 * 0.333 = 333,000.00333 -> rounds to 333,000.00 each,
    // summed and rounded => 999,000.00 (selector rounds the final sum).
    expect(s.weightedTotal.equals(Money.of("999000.01", "EUR"))).toBe(true);
    expect(s.openTotal.equals(Money.of("3000000.03", "EUR"))).toBe(true);
  });

  it("treats an open deal whose stage is missing as zero-weighted unless it overrides", () => {
    // Deal claims this pipeline but sits in an unknown stage and has no
    // probability override: it counts as open, adds to openTotal, but
    // contributes 0 to the weighted estimate (no stage default to borrow).
    const orphan = {
      ...dealSummit,
      id: "orphan",
      status: "active" as const,
      stageId: "no-such-stage",
      probability: undefined,
      amount: { amount: "5000000", currency: "EUR" },
    };
    const s = summarizePipeline(samplePipeline, [orphan]);
    expect(s.openCount).toBe(1);
    expect(s.openTotal.equals(Money.of("5000000", "EUR"))).toBe(true);
    expect(s.weightedTotal.isZero()).toBe(true);
  });

  it("handles an open deal with no amount without throwing", () => {
    const noAmount = {
      ...dealSummit,
      id: "no-amount",
      status: "active" as const,
      amount: undefined,
    };
    const s = summarizePipeline(samplePipeline, [noAmount]);
    expect(s.openCount).toBe(1);
    expect(s.openTotal.isZero()).toBe(true);
    expect(s.weightedTotal.isZero()).toBe(true);
  });
});

describe("buildBoard edge cases (adversarial)", () => {
  it("mixes deal-override and stage-default probabilities within one column", () => {
    // Two deals in the sourced column (stage default 0.1): one overrides to
    // 0.5, the other inherits. Weighted total must combine both correctly.
    const a = {
      ...dealHarbor,
      id: "a",
      stageId: "stage-sourced",
      amount: { amount: "1000000", currency: "EUR" },
      probability: 0.5,
    };
    const b = {
      ...dealHarbor,
      id: "b",
      stageId: "stage-sourced",
      amount: { amount: "1000000", currency: "EUR" },
      probability: undefined,
    };
    const board = buildBoard(samplePipeline, [a, b]);
    const sourced = board.find((c) => c.stage.id === "stage-sourced")!;
    expect(sourced.total.equals(Money.of("2000000", "EUR"))).toBe(true);
    // 1,000,000 * 0.5 + 1,000,000 * 0.1 = 600,000
    expect(sourced.weighted.equals(Money.of("600000", "EUR"))).toBe(true);
  });

  it("excludes amount-less deals from totals but keeps them in the count", () => {
    const withAmount = {
      ...dealHarbor,
      id: "with",
      stageId: "stage-sourced",
      amount: { amount: "1000000", currency: "EUR" },
    };
    const without = {
      ...dealHarbor,
      id: "without",
      stageId: "stage-sourced",
      amount: undefined,
    };
    const board = buildBoard(samplePipeline, [withAmount, without]);
    const sourced = board.find((c) => c.stage.id === "stage-sourced")!;
    expect(sourced.count).toBe(2);
    expect(sourced.total.equals(Money.of("1000000", "EUR"))).toBe(true);
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
