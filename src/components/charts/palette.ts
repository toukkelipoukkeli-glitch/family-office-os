/**
 * Categorical chart colours, sourced from the theme CSS variables so charts
 * stay in sync with light/dark mode. Use {@link seriesColor} to pick a stable
 * colour for the nth series, cycling through the 5-colour palette.
 */
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

/** Stable colour for the nth series (cycles through the palette). */
export function seriesColor(index: number): string {
  const len = CHART_COLORS.length;
  return CHART_COLORS[((index % len) + len) % len];
}
