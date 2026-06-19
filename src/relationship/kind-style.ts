import type { RelationshipNodeKind } from "@/lib/relationship/relationship-graph";

/**
 * Presentation constants for relationship-graph node kinds, kept in their own
 * module so the component files only export components (Fast Refresh friendly).
 */

/** Theme colour per node kind, sourced from the shared chart palette. */
export const KIND_COLOR: Record<RelationshipNodeKind, string> = {
  company: "var(--color-chart-1)",
  person: "var(--color-chart-2)",
  deal: "var(--color-chart-4)",
  contact: "var(--color-chart-5)",
};

/** Human label per node kind, used in the legend and detail panel. */
export const KIND_LABEL: Record<RelationshipNodeKind, string> = {
  company: "Company / entity",
  person: "Person",
  deal: "Deal",
  contact: "Founder / investor",
};
