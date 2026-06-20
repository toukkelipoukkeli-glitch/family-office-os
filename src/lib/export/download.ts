/**
 * In-browser file download wiring.
 *
 * {@link triggerDownload} turns a string payload into a client-side file
 * download by creating a `Blob`, an object URL, and a transient `<a download>`
 * element that it clicks and removes. This is the only DOM-touching part of the
 * export toolkit; the serializers ({@link import("./csv").toCsv},
 * {@link import("./json").toJson}) stay pure so they remain trivially testable.
 *
 * The browser primitives are injectable via {@link DownloadDeps} so a unit test
 * can assert *exactly* what would be downloaded (filename, MIME type, bytes)
 * without a real DOM — keeping the suite deterministic and offline. READ-ONLY:
 * this saves a file the user already sees; it never uploads or transmits.
 */

/** MIME types for the formats the toolkit emits. */
export const MIME = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
} as const;

/** A single export payload ready to be saved. */
export interface DownloadFile {
  /** Suggested file name, e.g. `net-worth-2026-06-19.csv`. */
  readonly filename: string;
  /** The file contents. */
  readonly content: string;
  /** MIME type. Defaults to `text/plain` when omitted. */
  readonly mimeType?: string;
}

/**
 * Injectable browser primitives. Defaults bind to the real `document`/`URL`/
 * `Blob`; tests pass fakes to capture the download without a DOM.
 */
export interface DownloadDeps {
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  readonly createElement: (tag: "a") => HTMLAnchorElement;
  readonly appendChild: (el: HTMLElement) => void;
  readonly removeChild: (el: HTMLElement) => void;
}

function defaultDeps(): DownloadDeps {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error(
      "triggerDownload requires a browser environment (document + URL); " +
        "pass DownloadDeps to run headless.",
    );
  }
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createElement: (tag) => document.createElement(tag),
    appendChild: (el) => document.body.appendChild(el),
    removeChild: (el) => document.body.removeChild(el),
  };
}

/**
 * Save `file` to the user's machine via a transient `<a download>` click.
 *
 * The object URL is always revoked, even if the click throws, so no memory is
 * leaked. Returns nothing; the side effect is the browser's save action.
 */
export function triggerDownload(
  file: DownloadFile,
  deps: DownloadDeps = defaultDeps(),
): void {
  const blob = new Blob([file.content], {
    type: file.mimeType ?? "text/plain;charset=utf-8",
  });
  const url = deps.createObjectURL(blob);
  const anchor = deps.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.rel = "noopener";
  // Some browsers require the element to be in the document to honour a
  // programmatic click; append, click, then remove. The removal runs in a
  // `finally` so a throwing `click()` cannot leave the transient node attached.
  deps.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    deps.removeChild(anchor);
    deps.revokeObjectURL(url);
  }
}

/** Sanitize an arbitrary label into a safe, lowercase file-name stem. */
export function slugifyFilename(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}
