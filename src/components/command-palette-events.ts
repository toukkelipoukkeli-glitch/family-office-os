/**
 * Cross-component bridge for opening the command palette.
 *
 * Lives in its own module (not the component file) so the React component file
 * only exports components — keeping Fast Refresh happy and letting a trigger
 * button open the palette without importing the component itself.
 */

/** Custom DOM event name dispatched on `window` to open the palette. */
export const COMMAND_PALETTE_OPEN_EVENT = "command-palette:open";

/** Dispatch the open event from anywhere (e.g. a header search button). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT));
}
