/**
 * Deterministic CSV serialization (RFC 4180).
 *
 * Turns a typed {@link CsvTable} — an ordered list of column headers plus an
 * ordered list of rows — into a byte-stable CSV string. Given the same table the
 * output is always identical, byte for byte, so it is snapshot-testable and safe
 * to archive or diff. Pure and offline: nothing here touches the network, the
 * clock, or the DOM, and nothing moves money — it only serializes values.
 *
 * Quoting follows RFC 4180: a field is wrapped in double quotes when it contains
 * the delimiter, a double quote, a CR, or an LF; embedded double quotes are
 * doubled. Rows are joined with CRLF (`\r\n`), the RFC line terminator, so the
 * file round-trips through spreadsheet apps unchanged.
 */

/** A single cell value. `null`/`undefined` serialize to an empty field. */
export type CsvCell = string | number | boolean | null | undefined;

/** A fully materialized table: ordered headers + ordered rows of cells. */
export interface CsvTable {
  /** Column headers, in output order. */
  readonly columns: readonly string[];
  /** Rows, each a list of cells aligned to {@link columns}. */
  readonly rows: ReadonlyArray<readonly CsvCell[]>;
}

/** Options controlling the CSV byte stream. */
export interface CsvOptions {
  /** Field delimiter. Default `","`. */
  readonly delimiter?: string;
  /** Line terminator. Default `"\r\n"` (RFC 4180). */
  readonly newline?: string;
  /**
   * Prepend a UTF-8 byte-order mark (U+FEFF). Helps Excel detect UTF-8 for
   * non-ASCII content. Default `false` so the bytes stay minimal and stable.
   */
  readonly bom?: boolean;
}

/** Render a cell to its raw (unquoted) string form. */
function cellToRaw(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "boolean") return cell ? "true" : "false";
  if (typeof cell === "number") {
    // Reject non-finite numbers rather than emitting "NaN"/"Infinity", which
    // would silently corrupt a numeric column.
    if (!Number.isFinite(cell)) {
      throw new Error(`Cannot serialize non-finite number to CSV: ${cell}`);
    }
    // `String(number)` is the shortest round-trippable form and is locale-
    // independent (always `.` decimal, no thousands separators).
    return String(cell);
  }
  return cell;
}

/** Quote a field per RFC 4180 if it contains a delimiter, quote, CR or LF. */
function quoteField(raw: string, delimiter: string): string {
  const needsQuoting =
    raw.includes(delimiter) ||
    raw.includes('"') ||
    raw.includes("\n") ||
    raw.includes("\r");
  if (!needsQuoting) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Serialize a {@link CsvTable} to a deterministic CSV string.
 *
 * Every row must have exactly as many cells as there are columns; a mismatch
 * throws rather than emitting a ragged file.
 */
export function toCsv(table: CsvTable, options: CsvOptions = {}): string {
  const { delimiter = ",", newline = "\r\n", bom = false } = options;
  const { columns, rows } = table;

  const encodeRow = (cells: readonly CsvCell[]): string =>
    cells.map((c) => quoteField(cellToRaw(c), delimiter)).join(delimiter);

  const lines: string[] = [encodeRow(columns)];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== columns.length) {
      throw new Error(
        `CSV row ${i} has ${row.length} cells but there are ${columns.length} columns`,
      );
    }
    lines.push(encodeRow(row));
  }

  // A trailing newline keeps the file POSIX-clean and diff-friendly.
  const body = `${lines.join(newline)}${newline}`;
  return bom ? `\uFEFF${body}` : body;
}
