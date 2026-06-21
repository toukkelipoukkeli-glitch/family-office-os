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
 *
 * Formula-injection hardening: a spreadsheet treats a cell whose text begins
 * with `=`, `+`, `-`, `@`, a tab, or a carriage return as a *formula*, so a
 * crafted text value (e.g. `=HYPERLINK(...)`, `@SUM(...)`, `-2+3+cmd|'…'!A1`)
 * could execute on open. By default ({@link CsvOptions.escapeFormulas}) such
 * *string* cells are neutralized with a leading single quote (`'`), which forces
 * the value to be treated as text. Machine-generated numbers/booleans are never
 * touched, and a string that is itself a plain number (e.g. `"-2.5"`) is left
 * alone because a spreadsheet reads it as a number, not a formula.
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
  /**
   * Neutralize spreadsheet formula injection. When `true` (the default), a
   * *string* cell beginning with a formula trigger (`=`, `+`, `-`, `@`, tab, or
   * CR) is prefixed with a single quote (`'`) so spreadsheets treat it as inert
   * text rather than executing it. Plain numeric strings and machine-generated
   * numbers/booleans are never altered. Set `false` only when the consumer is
   * known not to be a spreadsheet.
   */
  readonly escapeFormulas?: boolean;
}

/**
 * Characters that make a spreadsheet interpret a leading cell value as a
 * formula. Tab (`\t`) and CR (`\r`) are included because some importers strip
 * them and re-expose the following `=`/`+`/`-`/`@`.
 */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** A plain numeric string (optional sign, digits, optional fraction/exponent). */
const NUMERIC_STRING = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Neutralize a formula-injection vector in a *string* cell.
 *
 * Returns the value unchanged unless it begins with a formula trigger and is
 * not a plain number, in which case a single quote is prepended. Numeric
 * strings (`"-2.5"`, `"+10"`) are spreadsheet numbers, not formulas, so they
 * pass through untouched and keep their exact value.
 */
function neutralizeFormula(value: string): string {
  if (value.length === 0) return value;
  if (!FORMULA_TRIGGERS.has(value[0]!)) return value;
  if (NUMERIC_STRING.test(value)) return value;
  return `'${value}`;
}

/**
 * Render a cell to its raw (unquoted) string form.
 *
 * Only *string* cells are candidates for formula-injection escaping: a number
 * or boolean is machine-generated and can never be a formula, so it is emitted
 * verbatim regardless of `escapeFormulas`.
 */
function cellToRaw(cell: CsvCell, escapeFormulas: boolean): string {
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
  return escapeFormulas ? neutralizeFormula(cell) : cell;
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
  const {
    delimiter = ",",
    newline = "\r\n",
    bom = false,
    escapeFormulas = true,
  } = options;
  const { columns, rows } = table;

  const encodeRow = (cells: readonly CsvCell[]): string =>
    cells
      .map((c) => quoteField(cellToRaw(c, escapeFormulas), delimiter))
      .join(delimiter);

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
