/**
 * m12-export-toolkit — deterministic CSV/JSON export + in-browser download.
 *
 * A small, pure toolkit that serializes the app's data-heavy page models to
 * byte-stable CSV ({@link toCsv}) and JSON ({@link toJson}), plus the one
 * DOM-touching helper that saves the bytes to the user's machine
 * ({@link triggerDownload}). The `*Export` adapters in `./tables` map each
 * page's deterministic model onto an {@link ExportDataset}; `buildExportFile`
 * turns that into a {@link DownloadFile}. READ-ONLY: it only reports — nothing
 * here moves money, places trades, or transmits data off the device.
 */
export * from "./csv";
export * from "./json";
export * from "./download";
export * from "./tables";
