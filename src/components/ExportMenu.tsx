import * as React from "react";
import { Download } from "lucide-react";

import {
  buildExportFile,
  triggerDownload,
  type ExportDataset,
  type ExportFormat,
  type DownloadDeps,
} from "@/lib/export";
import { cn } from "@/lib/utils";

export interface ExportMenuProps {
  /** The dataset to serialize and download. */
  dataset: ExportDataset;
  /** `data-testid` prefix; the CSV/JSON buttons get `-csv` / `-json` suffixes. */
  testId?: string;
  /** Extra classes for the wrapper. */
  className?: string;
  /**
   * Injected browser primitives for {@link triggerDownload}. Production code
   * omits this (real `document`/`URL` are used); tests pass fakes to capture the
   * download without a DOM side effect.
   */
  downloadDeps?: DownloadDeps;
}

/**
 * A pair of "Export CSV / Export JSON" buttons that save the supplied
 * {@link ExportDataset} as a deterministic file. The serialization is pure
 * ({@link buildExportFile}); only the click handler touches the DOM, via
 * {@link triggerDownload}. READ-ONLY: it saves data the user already sees.
 */
export function ExportMenu({
  dataset,
  testId = "export",
  className,
  downloadDeps,
}: ExportMenuProps) {
  const handle = React.useCallback(
    (format: ExportFormat) => {
      triggerDownload(buildExportFile(dataset, format), downloadDeps);
    },
    [dataset, downloadDeps],
  );

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      data-testid={testId}
      role="group"
      aria-label="Export data"
    >
      <button
        type="button"
        className={btn}
        data-testid={`${testId}-csv`}
        onClick={() => handle("csv")}
      >
        <Download className="size-3.5" aria-hidden="true" />
        CSV
      </button>
      <button
        type="button"
        className={btn}
        data-testid={`${testId}-json`}
        onClick={() => handle("json")}
      >
        <Download className="size-3.5" aria-hidden="true" />
        JSON
      </button>
    </div>
  );
}

export default ExportMenu;
