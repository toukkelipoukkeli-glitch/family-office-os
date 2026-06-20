import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { openCommandPalette } from "@/components/command-palette-events";
import { cn } from "@/lib/utils";

/**
 * Detect the platform once on mount so the shortcut hint reads `⌘K` on macOS
 * and `Ctrl K` elsewhere. SSR-safe: defaults to the non-mac hint until mounted.
 */
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return isMac;
}

export interface CommandPaletteTriggerProps {
  className?: string;
  /** `data-testid` for the button (defaults to `command-palette-trigger`). */
  testId?: string;
}

/**
 * A visible affordance for the command palette: a compact "Search" button that
 * shows the keyboard shortcut and opens the palette on click. The palette is
 * fully keyboard-operable on its own (Cmd/Ctrl-K); this button just makes it
 * discoverable. Hidden from print so it never bleeds into reports.
 */
export function CommandPaletteTrigger({
  className,
  testId = "command-palette-trigger",
}: CommandPaletteTriggerProps) {
  const isMac = useIsMac();

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      data-testid={testId}
      aria-label="Open command palette"
      title="Search pages and actions"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-border px-2.5",
        "text-sm text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "print:hidden",
        className,
      )}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Search</span>
      <kbd
        className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block"
        aria-hidden="true"
      >
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

export default CommandPaletteTrigger;
