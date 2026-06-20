import { CONSOLIDATION_ENTITIES } from "@/lib/consolidation/fixtures";
import { HISTORICAL_SCENARIOS } from "@/lib/stress/scenarios";

/**
 * m13-palette-deeplink-actions — curated deep-link sub-views for the palette.
 *
 * The command palette navigates to every top-level route (generated from the
 * route registry). On top of that, a few pages expose deep-linkable *sub-views*
 * stored as a query param on the route's hash (see `@/lib/hash-location`):
 *
 *   - `#/stress?e=<episodeId>`        — a specific historical stress episode;
 *   - `#/consolidation?entity=<id>`   — drill into a specific entity.
 *
 * Surfacing those sub-views directly in the palette means a user can jump to,
 * say, "Stress · 2008 Global Financial Crisis" in one keystroke instead of
 * navigating to the page and then selecting the episode.
 *
 * The deep-link entries are *derived from the same fixtures the pages render*,
 * so the targets are always real ids — there is no hand-maintained second list
 * of ids to drift out of sync. The target pages also clamp an unknown id back to
 * their default selection, so a deep link can never strand the user.
 *
 * READ-ONLY product: a deep link only changes which sub-view is shown; it never
 * moves money or places a trade.
 */

/** A curated deep link into a route's sub-view. */
export interface DeepLink {
  /** Stable id (also the palette command id suffix and `data-testid`). */
  readonly id: string;
  /** Route path the deep link targets (e.g. `/stress`). */
  readonly path: string;
  /** Query string (without the leading `?`) selecting the sub-view. */
  readonly query: string;
  /** Primary label shown in the palette (e.g. "2008 Global Financial Crisis"). */
  readonly label: string;
  /** Group hint shown muted to the right (the parent page name). */
  readonly hint: string;
  /** Extra words folded into the search haystack but not displayed. */
  readonly keywords: string;
}

/** Build the full hash (including the leading `#`) a deep link points at. */
export function deepLinkHash(link: DeepLink): string {
  return link.query === "" ? `#${link.path}` : `#${link.path}?${link.query}`;
}

/**
 * The curated deep links, derived from page fixtures.
 *
 * Stress episodes and consolidation entities both store their selection in the
 * route hash, so each fixture becomes one deep link. The lists are slugged
 * through a stable id derived from the fixture id, so the palette command ids
 * (and their e2e selectors) stay stable as long as the fixture ids do.
 */
export const DEEP_LINKS: readonly DeepLink[] = [
  ...HISTORICAL_SCENARIOS.map(
    (scenario): DeepLink => ({
      id: `deeplink:stress:${scenario.id}`,
      path: "/stress",
      query: `e=${encodeURIComponent(scenario.id)}`,
      label: scenario.name,
      hint: "Stress tests",
      keywords: `stress scenario episode drawdown ${scenario.id.replace(/-/g, " ")}`,
    }),
  ),
  ...CONSOLIDATION_ENTITIES.map(
    (entity): DeepLink => ({
      id: `deeplink:consolidation:${entity.id}`,
      path: "/consolidation",
      query: `entity=${encodeURIComponent(entity.id)}`,
      label: entity.name,
      hint: "Consolidation",
      keywords: `consolidation entity rollup structure ${entity.id.replace(/-/g, " ")}`,
    }),
  ),
];
