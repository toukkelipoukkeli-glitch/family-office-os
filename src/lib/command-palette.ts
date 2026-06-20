import { ROUTES, type RouteGroup } from "@/lib/routes";
import { DEEP_LINKS, deepLinkHash, type DeepLink } from "@/lib/palette/deep-links";
import {
  DEFAULT_REPORTING_CURRENCY,
  REPORTING_CURRENCIES,
} from "@/lib/reporting-currency";

/**
 * Command-palette command model + filtering.
 *
 * The palette's command list is generated from the same typed route registry
 * ({@link ROUTES}) that drives the dashboard navigation and the router, plus:
 *   - curated **deep links** into route sub-views ({@link DEEP_LINKS}), e.g.
 *     "Stress · 2008 Global Financial Crisis";
 *   - **reporting-currency** quick actions, e.g. "Reporting currency → EUR";
 *   - a few fixed quick actions (dashboard, toggle theme);
 *   - the user's **recently visited pages**, floated to the top of the list.
 *
 * Keeping the navigation + deep-link + currency commands generated from shared
 * registries means new routes / sub-views / currencies appear automatically —
 * there is no second list to keep in sync.
 */

/**
 * The kind of a command, used to label/group results and to drive `runCommand`:
 *  - `navigation` — go to a route or deep-link sub-view (carries an `href`);
 *  - `action`     — a one-shot quick action (theme, dashboard);
 *  - `currency`   — switch the global reporting currency to `currencyCode`.
 */
export type CommandKind = "navigation" | "action" | "currency";

/** One executable entry in the palette. */
export interface Command {
  /** Stable id (also used as the React key and the e2e `data-testid` suffix). */
  id: string;
  /** Human label shown as the primary line of the result. */
  label: string;
  /** Secondary line / group label shown muted to the right or below. */
  hint: string;
  /** Navigation vs. a quick action vs. a currency switch — drives the badge. */
  kind: CommandKind;
  /**
   * Extra words folded into the searchable haystack but not displayed, so a
   * query like "money" can find "Cashflow". Optional.
   */
  keywords?: string;
  /**
   * For navigation commands, the hash href (including `#`) to navigate to. Set
   * for both top-level routes and deep-link sub-views; absent for actions.
   */
  href?: string;
  /** For currency commands, the reporting-currency code to switch to. */
  currencyCode?: string;
}

/** Options that personalise the generated command list. */
export interface BuildCommandsOptions {
  /**
   * Recently visited route paths, most-recent-first. Each that resolves to a
   * known route is surfaced as a "Recent" navigation command at the top of the
   * list (the current page is excluded so the top entry is somewhere to *go*).
   */
  recentPaths?: readonly string[];
  /** The currently selected reporting-currency code, marked as active. */
  currentCurrency?: string;
}

/**
 * Human-readable names for the route groups, used as each navigation command's
 * hint ("Performance", "Risk", …) so results are self-describing.
 */
const GROUP_LABEL: Record<RouteGroup, string> = {
  overview: "Overview",
  performance: "Performance",
  policy: "Policy",
  holdings: "Holdings",
  structure: "Structure",
  risk: "Risk",
  planning: "Planning",
  ops: "Ops",
};

/** Build the navigation command for a top-level registry route. */
function routeCommand(path: string, label: string, group: RouteGroup): Command {
  return {
    id: `route:${path}`,
    label,
    hint: GROUP_LABEL[group],
    kind: "navigation",
    keywords: path.replace(/[/-]/g, " "),
    href: `#${path}`,
  };
}

/** Build the navigation command for a curated deep-link sub-view. */
function deepLinkCommand(link: DeepLink): Command {
  return {
    id: link.id,
    label: link.label,
    hint: link.hint,
    kind: "navigation",
    keywords: link.keywords,
    href: deepLinkHash(link),
  };
}

/**
 * Build the full, ordered command list:
 *  1. recently visited pages (when supplied),
 *  2. fixed quick actions (dashboard, theme),
 *  3. reporting-currency switch actions (one per supported currency),
 *  4. one navigation command per registry route,
 *  5. curated deep-link sub-views.
 *
 * `options.recentPaths` floats just-visited routes to the top; `currentCurrency`
 * marks the active currency so its switch command reads "(current)".
 */
export function buildCommands(options: BuildCommandsOptions = {}): Command[] {
  const { recentPaths = [], currentCurrency = DEFAULT_REPORTING_CURRENCY } =
    options;

  const navCommands: Command[] = ROUTES.map((route) =>
    routeCommand(route.path, route.label, route.group),
  );

  // Recent pages: resolve each recorded path to a known route, de-duplicate, and
  // emit a "Recent" navigation command. Unknown/stale paths are skipped.
  const routeByPath = new Map(ROUTES.map((r) => [r.path, r]));
  const seenRecent = new Set<string>();
  const recentCommands: Command[] = [];
  for (const path of recentPaths) {
    const route = routeByPath.get(path);
    if (!route || seenRecent.has(path)) continue;
    seenRecent.add(path);
    recentCommands.push({
      id: `recent:${path}`,
      label: route.label,
      hint: "Recent",
      kind: "navigation",
      keywords: `recent history ${path.replace(/[/-]/g, " ")}`,
      href: `#${path}`,
    });
  }

  const actions: Command[] = [
    {
      id: "action:dashboard",
      label: "Go to dashboard",
      hint: "Quick action",
      kind: "action",
      keywords: "home net worth overview root",
    },
    {
      id: "action:toggle-theme",
      label: "Toggle light / dark theme",
      hint: "Quick action",
      kind: "action",
      keywords: "dark light mode appearance contrast",
    },
  ];

  const normalizedCurrent = currentCurrency.trim().toUpperCase();
  const currencyCommands: Command[] = REPORTING_CURRENCIES.map((c) => {
    const isCurrent = c.code === normalizedCurrent;
    return {
      id: `currency:${c.code}`,
      label: `Reporting currency → ${c.code}${isCurrent ? " (current)" : ""}`,
      hint: "Currency",
      kind: "currency" as const,
      keywords: `reporting currency base ${c.code} ${c.label} ${c.symbol}`,
      currencyCode: c.code,
    };
  });

  const deepLinkCommands: Command[] = DEEP_LINKS.map(deepLinkCommand);

  return [
    ...recentCommands,
    ...actions,
    ...currencyCommands,
    ...navCommands,
    ...deepLinkCommands,
  ];
}

/**
 * Hash href a navigation command points at. Returns the command's `href` (set
 * for both top-level routes and deep-link sub-views), or `undefined` for
 * non-navigation commands (actions, currency switches).
 */
export function commandHref(command: Command): string | undefined {
  return command.kind === "navigation" ? command.href : undefined;
}

/**
 * Subsequence (fuzzy) match: returns true when every character of `query`
 * appears in `text` in order. Case-insensitive. An empty query matches.
 *
 * This is the same forgiving matching behaviour command palettes are expected
 * to have ("cshf" → "Cashflow"), kept dependency-free and deterministic.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().trim();
  if (q === "") return true;
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/**
 * Score a command against a query for ranking. Higher is better. Returns a
 * negative number when the command does not match at all.
 *
 * The ranking prefers, in order: an exact label match, a label prefix match, a
 * label substring match, then a fuzzy subsequence match across the full
 * haystack (label + hint + keywords). Within each tier shorter labels rank
 * higher so the most specific result floats up.
 */
function scoreCommand(query: string, command: Command): number {
  const q = query.toLowerCase().trim();
  const label = command.label.toLowerCase();
  const haystack =
    `${command.label} ${command.hint} ${command.keywords ?? ""}`.toLowerCase();

  if (q === "") return 0;
  if (label === q) return 1000;
  if (label.startsWith(q)) return 800 - label.length;
  if (label.includes(q)) return 600 - label.length;
  if (haystack.includes(q)) return 400 - label.length;
  if (fuzzyMatch(q, haystack)) return 200 - label.length;
  return -1;
}

/**
 * Filter + rank commands for a query, preserving the original order for an
 * empty query (so the palette opens showing the full list in registry order).
 */
export function filterCommands(query: string, commands: Command[]): Command[] {
  if (query.trim() === "") return commands;
  return commands
    .map((command) => ({ command, score: scoreCommand(query, command) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}
