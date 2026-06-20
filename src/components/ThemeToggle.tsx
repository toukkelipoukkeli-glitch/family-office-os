import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme/use-theme";
import type { ThemePreference } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

const ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const NEXT_LABEL: Record<ThemePreference, string> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export interface ThemeToggleProps {
  className?: string;
  /** `data-testid` for the button (defaults to `theme-toggle`). */
  testId?: string;
}

/**
 * Header control that cycles the theme preference system → light → dark → … and
 * persists it. The icon reflects the *current* preference; the accessible label
 * and tooltip announce what clicking will switch to next. Hidden from print so
 * the chrome doesn't bleed into reports.
 */
export function ThemeToggle({
  className,
  testId = "theme-toggle",
}: ThemeToggleProps) {
  const { preference, resolved, cyclePreference } = useTheme();
  const Icon = ICON[preference];
  const title = `Theme: ${LABEL[preference]} — click for ${NEXT_LABEL[preference]}`;

  return (
    <button
      type="button"
      onClick={cyclePreference}
      data-testid={testId}
      data-theme-preference={preference}
      data-theme-resolved={resolved}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border",
        "text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "print:hidden",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </button>
  );
}

export default ThemeToggle;
