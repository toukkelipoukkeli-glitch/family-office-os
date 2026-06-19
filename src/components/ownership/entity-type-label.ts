import type { Company } from "@/lib/company";

/** Short, human label for an entity type (used in node chips and the legend). */
export function entityTypeLabel(type: Company["entityType"]): string {
  switch (type) {
    case "holding_company":
      return "Holding";
    case "llc":
      return "LLC";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}
