import type { ReactNode } from "react";

import { MAIN_CONTENT_ID } from "@/lib/main-content";
import { CommandPaletteTrigger } from "@/components/CommandPaletteTrigger";
import { ReportingCurrencySwitcher } from "@/components/ReportingCurrencySwitcher";
import { TagFilter } from "@/components/TagFilter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

/** Content-column max width. Mirrors the Tailwind widths pages already use. */
export type AppShellWidth = "4xl" | "5xl" | "6xl";

const WIDTH_CLASS: Record<AppShellWidth, string> = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

export interface AppShellProps {
  /** Page title rendered as the `<h1>` in the header. */
  title: ReactNode;
  /**
   * Extra classes for the `<h1>` (e.g. `flex items-center gap-2` when the title
   * embeds an icon). Merged with the base heading classes.
   */
  titleClassName?: string;
  /** Content-column max width. Defaults to `6xl`. */
  width?: AppShellWidth;
  /** `data-testid` for the outermost wrapper `<div>`. */
  containerTestId?: string;
  /**
   * Optional element rendered to the right of the title inside the header's
   * left cluster (e.g. an "as of" date or a stage count).
   */
  titleAside?: ReactNode;
  /**
   * Optional subtitle rendered beneath the title. When set, the title + subtitle
   * stack vertically (matching the pages that show a secondary line).
   */
  subtitle?: ReactNode;
  /**
   * Optional actions rendered on the right of the header, before the back link
   * (e.g. an export toggle). Laid out in the same flex row as the back link.
   */
  actions?: ReactNode;
  /** Where the back link points. Defaults to the dashboard (`#/`). */
  backHref?: string;
  /** Visible text of the back link. Defaults to "Back to dashboard". */
  backLabel?: string;
  /** `data-testid` for the back link (kept per-page for e2e selectors). */
  backTestId?: string;
  /** Hide the back link entirely (rare; for shells that navigate elsewhere). */
  hideBack?: boolean;
  /** Extra classes for the `<main>` element. */
  mainClassName?: string;
  /** `data-testid` for the `<main>` element. */
  mainTestId?: string;
  /** Page body. */
  children: ReactNode;
}

/**
 * Shared application chrome: the full-height background, the sticky-style header
 * (title on the left, optional actions + a "back to dashboard" link on the
 * right) and a centred `<main>` content column.
 *
 * Pages used to hand-roll this chrome individually; centralising it here keeps
 * every page visually consistent and lets the markup evolve in one place. The
 * emitted DOM is intentionally identical to the previous per-page chrome so the
 * refactor introduces no behavioural or visual regressions, and all existing
 * `data-testid` selectors are preserved via props.
 */
export function AppShell({
  title,
  titleClassName,
  width = "6xl",
  containerTestId,
  titleAside,
  subtitle,
  actions,
  backHref = "#/",
  backLabel = "Back to dashboard",
  backTestId,
  hideBack = false,
  mainClassName,
  mainTestId,
  children,
}: AppShellProps) {
  const widthClass = WIDTH_CLASS[width];
  const backLink = hideBack ? null : (
    <a
      href={backHref}
      data-testid={backTestId}
      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      {backLabel}
    </a>
  );

  const heading = (
    <h1 className={cn("text-lg font-semibold tracking-tight", titleClassName)}>
      {title}
    </h1>
  );

  let titleBlock: ReactNode;
  if (subtitle) {
    // Title stacked above a secondary line.
    titleBlock = (
      <div>
        {heading}
        {subtitle}
      </div>
    );
  } else if (titleAside) {
    // Title with an inline aside (e.g. an "as of" date) on the same baseline.
    titleBlock = (
      <div className="flex items-baseline gap-3">
        {heading}
        {titleAside}
      </div>
    );
  } else {
    titleBlock = heading;
  }

  return (
    <div
      // `overflow-x-clip` is a belt-and-braces guard: even though the header's
      // control cluster scrolls its own overflow internally, some browsers still
      // grow the document's horizontal scroll width from a clipped flex child.
      // Clipping the x-axis at the page root keeps the document itself from ever
      // scrolling sideways (the oracle: `scrollWidth <= clientWidth`) while
      // leaving the y-axis visible so sticky headers / dropdowns are unaffected.
      className="min-h-screen overflow-x-clip bg-background text-foreground"
      data-testid={containerTestId}
    >
      <header className="border-b border-border">
        <div
          className={cn(
            // On small screens the title + the actions/back cluster can be wider
            // than the viewport (the cluster carries an export menu, the global
            // filter/currency/palette/theme controls and a "Back to dashboard"
            // link). Let the row wrap to a second line there — `min-h-16` keeps
            // the familiar 64px height when it fits on one line, and the vertical
            // padding gives the wrapped state breathing room — so the header
            // never forces the document wider than the viewport. From `sm` up,
            // `flex-nowrap` restores the original single-row layout unchanged.
            "mx-auto flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2 sm:flex-nowrap sm:py-0",
            widthClass,
          )}
        >
          {/* Let the title block shrink instead of pushing the row wider. */}
          <div className="min-w-0 shrink">{titleBlock}</div>

          {/* The control cluster (export menu + filter/currency/palette/theme +
              back link) can on its own be wider than a phone viewport. Let its
              items wrap onto additional lines on small screens (`flex-wrap`,
              right-aligned) rather than overflowing — so nothing is pushed past
              the viewport edge. On `sm` up there is ample room, so
              `flex-nowrap` restores the original single-row cluster unchanged. */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 sm:flex-nowrap sm:gap-4">
            {actions}
            {/* The global holding-tag filter is surfaced on every shell page so
                the active selection is visible and adjustable anywhere, not just
                on the dashboard. It renders nothing when there are no tags. */}
            <TagFilter />
            {/* Global reporting-currency switcher: re-expresses portfolio values
                in the chosen base on every shell page. */}
            <ReportingCurrencySwitcher className="hidden sm:inline-flex" />
            <CommandPaletteTrigger />
            <ThemeToggle />
            {backLink}
          </div>
        </div>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        className={cn("mx-auto px-6 py-10", widthClass, mainClassName)}
        data-testid={mainTestId}
      >
        {children}
      </main>
    </div>
  );
}

export default AppShell;
