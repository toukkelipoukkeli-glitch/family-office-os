import * as z from "zod";

import { Id } from "../model/primitives";

/**
 * Pipeline stage model for the deal tracker.
 *
 * A pipeline is an ordered list of {@link PipelineStage}s a deal moves through,
 * from first sourcing to a terminal outcome (closed-won or closed-lost). This
 * is a read-only tracking concept: advancing a deal records *that the family
 * decided to advance it*, it never executes anything.
 */

/**
 * The kind of a stage. Most stages are `open` (work in progress); a pipeline
 * ends in exactly one `won` stage and one `lost` stage so the UI can compute
 * win-rate and treat terminal stages specially.
 */
export const STAGE_KINDS = ["open", "won", "lost"] as const;
export const StageKind = z.enum(STAGE_KINDS);
export type StageKind = z.infer<typeof StageKind>;

/**
 * A single stage in a pipeline.
 *
 * - `order` defines the left-to-right position of the stage (lower is earlier).
 * - `probability` is the default close-probability (0..1) the UI applies to
 *   deals sitting in this stage, used for a weighted-pipeline estimate.
 */
export const PipelineStage = z
  .object({
    /** Stable id for this stage. */
    id: Id,
    /** Human-readable stage name (e.g. "Sourced", "Due diligence", "Closed"). */
    name: z.string().trim().min(1, "stage name must not be empty"),
    /** Position in the pipeline (lower is earlier). Non-negative integer. */
    order: z.number().int().min(0, "order must be a non-negative integer"),
    /** open / won / lost. */
    kind: StageKind.default("open"),
    /** Default close-probability for deals in this stage, in [0, 1]. */
    probability: z
      .number()
      .min(0, "probability must be >= 0")
      .max(1, "probability must be <= 1")
      .default(0),
  })
  .strict();
export type PipelineStage = z.infer<typeof PipelineStage>;

/**
 * An ordered pipeline definition: a named set of stages a deal flows through.
 * Validates that stage ids and orders are unique, and that the pipeline has
 * exactly one `won` and one `lost` terminal stage.
 */
export const Pipeline = z
  .object({
    /** Stable id for this pipeline. */
    id: Id,
    /** Human-readable name (e.g. "Direct private equity"). */
    name: z.string().trim().min(1, "pipeline name must not be empty"),
    /** The ordered stages. Must contain at least one stage. */
    stages: z.array(PipelineStage).min(1, "a pipeline needs at least one stage"),
  })
  .strict()
  .superRefine((pipeline, ctx) => {
    const seenId = new Set<string>();
    const seenOrder = new Set<number>();
    let won = 0;
    let lost = 0;
    pipeline.stages.forEach((stage, i) => {
      if (seenId.has(stage.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate stage id: ${stage.id}`,
          path: ["stages", i, "id"],
        });
      }
      seenId.add(stage.id);
      if (seenOrder.has(stage.order)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate stage order: ${stage.order}`,
          path: ["stages", i, "order"],
        });
      }
      seenOrder.add(stage.order);
      if (stage.kind === "won") won += 1;
      if (stage.kind === "lost") lost += 1;
    });
    if (won !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `a pipeline must have exactly one "won" stage (found ${won})`,
        path: ["stages"],
      });
    }
    if (lost !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `a pipeline must have exactly one "lost" stage (found ${lost})`,
        path: ["stages"],
      });
    }
  });
export type Pipeline = z.infer<typeof Pipeline>;

/** Return the stages of a pipeline sorted by ascending `order`. */
export function orderedStages(pipeline: Pipeline): PipelineStage[] {
  return [...pipeline.stages].sort((a, b) => a.order - b.order);
}
