import { ROUTES, type RouteGroup } from "@/lib/routes";

/**
 * Command-palette command model + filtering.
 *
 * The palette's command list is generated from the same typed route registry
 * ({@link ROUTES}) that drives the dashboard navigation and the router, plus a
 * small set of fixed "quick actions" (e.g. jump to the dashboard, toggle the
 * theme). Keeping the navigation commands generated from the registry means a
 * new route automatically appears in the palette — there is no second list to
 * keep in sync.
 */

/** The kind of a command, used purely to label/group results. */
export type CommandKind = "navigation" | "action";

/** One executable entry in the palette. */
export interface Command {
  /** Stable id (also used as the React key and the e2e `data-testid` suffix). */
  id: string;
  /** Human label shown as the primary line of the result. */
  label: string;
  /** Secondary line / group label shown muted to the right or below. */
  hint: string;
  /** Navigation vs. a quick action — drives the small leading badge. */
  kind: CommandKind;
  /**
   * Extra words folded into the searchable haystack but not displayed, so a
   * query like "money" can find "Cashflow". Optional.
   */
  keywords?: string;
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

/**
 * Build the full, ordered command list: a fixed set of quick actions followed
 * by one navigation command per registry route.
 *
 * `onToggleTheme` is threaded in so the theme command can call back into the
 * app's theme controller without this module importing React/DOM state.
 */
export function buildCommands(): Command[] {
  const navCommands: Command[] = ROUTES.map((route) => ({
    id: `route:${route.path}`,
    label: route.label,
    hint: GROUP_LABEL[route.group],
    kind: "navigation" as const,
    keywords: route.path.replace(/[/-]/g, " "),
  }));

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

  return [...actions, ...navCommands];
}

/**
 * Hash path a navigation command points at, derived from its id. Returns
 * `undefined` for non-navigation commands.
 */
export function commandHref(command: Command): string | undefined {
  const prefix = "route:";
  if (!command.id.startsWith(prefix)) return undefined;
  return `#${command.id.slice(prefix.length)}`;
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
