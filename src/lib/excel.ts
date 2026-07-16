// Excel parsing with SheetJS. Auto-detects the ID / email / name / surname
// columns from the header row so the user doesn't have to format the sheet.
import * as XLSX from "xlsx";
import type { ExcelRow } from "./types";
import { normaliseId } from "./match";

/** Header keywords, in priority order, for each logical column. */
const HEADER_HINTS = {
  idNo: ["id no", "id number", "idnumber", "identity", "id_no", "id"],
  email: ["email", "e-mail", "e mail", "mail"],
  surname: ["surname", "last name", "lastname", "trading name"],
  name: ["first two names", "full names", "first name", "firstname", "name"],
} as const;

type LogicalCol = keyof typeof HEADER_HINTS;

function pickColumn(headers: string[], col: LogicalCol): number {
  const lowered = headers.map((h) => (h ?? "").toString().trim().toLowerCase());
  for (const hint of HEADER_HINTS[col]) {
    // Prefer an exact header match, then a contains-match.
    const exact = lowered.indexOf(hint);
    if (exact >= 0) return exact;
  }
  for (const hint of HEADER_HINTS[col]) {
    const idx = lowered.findIndex((h) => h.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface ExcelParseResult {
  rows: ExcelRow[];
  headers: string[];
  mapping: Record<LogicalCol, number>;
  /** Logical columns we could not locate in the header row. */
  missing: LogicalCol[];
}

export async function parseExcel(file: File): Promise<ExcelParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (grid.length === 0) {
    return { rows: [], headers: [], mapping: emptyMapping(), missing: [] };
  }

  const headers = (grid[0] as unknown[]).map((h) => String(h ?? ""));
  const mapping: Record<LogicalCol, number> = {
    idNo: pickColumn(headers, "idNo"),
    email: pickColumn(headers, "email"),
    surname: pickColumn(headers, "surname"),
    name: pickColumn(headers, "name"),
  };
  const missing = (Object.keys(mapping) as LogicalCol[]).filter(
    (k) => mapping[k] < 0,
  );

  const rows: ExcelRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r] as unknown[];
    const cell = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    const idNo = cell(mapping.idNo);
    const email = cell(mapping.email);
    const surname = cell(mapping.surname);
    const name = cell(mapping.name);
    if (!idNo && !email && !surname && !name) continue; // skip blank rows

    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => (raw[h || `col${i}`] = cells[i]));
    rows.push({ idNo: normaliseId(idNo), name, surname, email, raw });
  }

  return { rows, headers, mapping, missing };
}

function emptyMapping(): Record<LogicalCol, number> {
  return { idNo: -1, email: -1, surname: -1, name: -1 };
}
