import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Search, Zap } from "lucide-react";

import {
  buildCommands,
  commandHref,
  filterCommands,
  type Command,
} from "@/lib/command-palette";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/components/command-palette-events";
import { useTheme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils";

/**
 * Global command palette (Cmd/Ctrl-K).
 *
 * A keyboard-first launcher for navigating to any route (generated from the
 * typed route registry) plus a couple of quick actions. It is mounted once at
 * the app root so it works on every page.
 *
 * Accessibility:
 * - opens on Cmd-K / Ctrl-K from anywhere, closes on Esc or backdrop click;
 * - the dialog is a focus trap (Tab/Shift-Tab cycle within it) and restores
 *   focus to the previously-focused element on close;
 * - the input is a `combobox` controlling a `listbox`; results are `option`s
 *   with `aria-selected`, navigated with Arrow keys and activated with Enter,
 *   matching the WAI-ARIA combobox pattern;
 * - `aria-activedescendant` points the screen reader at the highlighted option.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The element focused before the palette opened, restored on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { cyclePreference } = useTheme();

  const commands = useMemo(() => buildCommands(), []);
  const results = useMemo(
    () => filterCommands(query, commands),
    [query, commands],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const runCommand = useCallback(
    (command: Command) => {
      const href = commandHref(command);
      if (href) {
        window.location.hash = href;
      } else if (command.id === "action:dashboard") {
        window.location.hash = "#/";
      } else if (command.id === "action:toggle-theme") {
        cyclePreference();
      }
      close();
    },
    [cyclePreference, close],
  );

  // Global Cmd-K / Ctrl-K to open (and toggle) the palette, plus a custom
  // `command-palette:open` event so a visible trigger button (or any other UI)
  // can open it without re-implementing the keyboard handling.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // On open: remember focus + focus the input. On close: restore focus.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus after paint so the input exists in the DOM.
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    restoreFocusRef.current?.focus?.();
    return undefined;
  }, [open]);

  // Keep the active option in view as the user arrows through results.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const node = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    // `scrollIntoView` is unimplemented in jsdom; guard it so unit tests (and
    // any non-DOM environment) don't throw.
    node?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  // Reset the highlight to the top whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const onDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) =>
          results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(0, results.length - 1));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const command = results[activeIndex];
        if (command) runCommand(command);
        return;
      }

      // Focus trap: the input is the only focusable element, so any Tab keeps
      // focus on it (and never escapes to the page behind the backdrop).
      if (event.key === "Tab") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    },
    [results, activeIndex, runCommand, close],
  );

  if (!open) return null;

  const listboxId = "command-palette-listbox";
  const activeOptionId =
    results[activeIndex] != null
      ? `command-option-${results[activeIndex].id}`
      : undefined;

  return (
    <div
      // Backdrop. Clicking it (outside the dialog) closes the palette.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      data-testid="command-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        onKeyDown={onDialogKeyDown}
        className={cn(
          "w-full max-w-xl overflow-hidden rounded-xl border border-border",
          "bg-popover text-popover-foreground shadow-2xl",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label="Search commands and pages"
            placeholder="Search pages and actions…"
            data-testid="command-palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(
              "h-12 w-full bg-transparent text-sm outline-none",
              "placeholder:text-muted-foreground",
            )}
          />
          <kbd
            className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block"
            aria-hidden="true"
          >
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Commands"
          data-testid="command-palette-results"
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <li
              role="option"
              aria-selected="false"
              aria-disabled="true"
              data-testid="command-palette-empty"
              className="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              No matching commands
            </li>
          ) : (
            results.map((command, index) => {
              const selected = index === activeIndex;
              const Icon = command.kind === "action" ? Zap : ArrowRight;
              return (
                <li
                  key={command.id}
                  id={`command-option-${command.id}`}
                  role="option"
                  aria-selected={selected}
                  data-testid={`command-option-${command.id}`}
                  data-active={selected ? "true" : "false"}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      command.kind === "action"
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{command.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {command.hint}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

export default CommandPalette;
