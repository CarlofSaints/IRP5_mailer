// Excel parsing with SheetJS. Auto-detects the ID / email / name / surname
// columns from the header row, but the mapping can be overridden by the user.
import * as XLSX from "xlsx";
import type { ExcelRow } from "./types";

/** Header keywords, in priority order, for each logical column. */
const HEADER_HINTS = {
  idNo: ["id no", "id number", "idnumber", "identity", "id_no", "id"],
  email: ["email", "e-mail", "e mail", "mail"],
  surname: ["surname", "last name", "lastname", "trading name"],
  name: ["first two names", "full names", "first name", "firstname", "name"],
} as const;

export type LogicalCol = keyof typeof HEADER_HINTS;
export type ColMap = Record<LogicalCol, number>;

export const LOGICAL_COLS: LogicalCol[] = ["idNo", "email", "surname", "name"];

export const COL_LABELS: Record<LogicalCol, string> = {
  idNo: "ID No.",
  email: "Email",
  surname: "Surname",
  name: "Name",
};

function pickColumn(headers: string[], col: LogicalCol): number {
  const lowered = headers.map((h) => (h ?? "").toString().trim().toLowerCase());
  for (const hint of HEADER_HINTS[col]) {
    const exact = lowered.indexOf(hint);
    if (exact >= 0) return exact;
  }
  for (const hint of HEADER_HINTS[col]) {
    const idx = lowered.findIndex((h) => {
      if (!h.includes(hint)) return false;
      // "name" must not swallow a "surname" column via the contains check.
      if (col === "name" && h.includes("surname")) return false;
      return true;
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

function autoMap(headers: string[]): ColMap {
  return {
    idNo: pickColumn(headers, "idNo"),
    email: pickColumn(headers, "email"),
    surname: pickColumn(headers, "surname"),
    name: pickColumn(headers, "name"),
  };
}

function mapScore(m: ColMap): number {
  return LOGICAL_COLS.filter((c) => m[c] >= 0).length;
}

/** Parsed sheet, kept raw so the column mapping can be re-applied on demand. */
export interface ExcelData {
  fileName: string;
  sheetName: string;
  headers: string[];
  dataRows: unknown[][];
  autoMapping: ColMap;
}

export async function parseExcel(file: File): Promise<ExcelData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Workbooks may have several sheets (e.g. an instructions/lookup sheet plus
  // the real data). Score every sheet by how many of our columns its header
  // row maps, and pick the best — falling back to the one with the most rows.
  let best: {
    sheetName: string;
    headers: string[];
    dataRows: unknown[][];
    autoMapping: ColMap;
    score: number;
  } | null = null;

  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (grid.length === 0) continue;
    const headers = (grid[0] as unknown[]).map((h) => String(h ?? ""));
    const dataRows = grid.slice(1) as unknown[][];
    const autoMapping = autoMap(headers);
    const score = mapScore(autoMapping);
    const candidate = { sheetName, headers, dataRows, autoMapping, score };
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        candidate.dataRows.length > best.dataRows.length)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return {
      fileName: file.name,
      sheetName: wb.SheetNames[0] ?? "",
      headers: [],
      dataRows: [],
      autoMapping: emptyMapping(),
    };
  }

  return {
    fileName: file.name,
    sheetName: best.sheetName,
    headers: best.headers,
    dataRows: best.dataRows,
    autoMapping: best.autoMapping,
  };
}

/** Turn the raw rows into normalised ExcelRows using the given column mapping. */
export function buildExcelRows(data: ExcelData, mapping: ColMap): ExcelRow[] {
  const rows: ExcelRow[] = [];
  for (const cells of data.dataRows) {
    const cell = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    const idNo = cell(mapping.idNo);
    const email = cell(mapping.email);
    const surname = cell(mapping.surname);
    const name = cell(mapping.name);
    if (!idNo && !email && !surname && !name) continue; // skip blank rows

    const raw: Record<string, unknown> = {};
    data.headers.forEach((h, i) => (raw[h || `col${i}`] = cells[i]));
    // Keep the identifier raw (trimmed) — could be an SA ID or a passport.
    rows.push({ idNo: idNo.trim(), name, surname, email, raw });
  }
  return rows;
}

/** Logical columns not mapped to any sheet column. */
export function missingCols(mapping: ColMap): LogicalCol[] {
  return LOGICAL_COLS.filter((k) => mapping[k] < 0);
}

function emptyMapping(): ColMap {
  return { idNo: -1, email: -1, surname: -1, name: -1 };
}
