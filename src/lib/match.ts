// Matching logic: join each PDF to an Excel row by ID number and flag
// field-level agreement so the user can visually verify before sending.
import type { ExcelRow, MatchRow, PdfDoc } from "./types";

/** Strip everything except digits (IDs sometimes carry spaces/apostrophes). */
export function normaliseId(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Loose name comparison: case-insensitive, whitespace-collapsed. */
function nameEq(a: string, b: string): boolean {
  const clean = (s: string) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  // Tolerate one being a prefix/subset of the other (e.g. "HENDRIK" vs
  // "HENDRIK JOHN", or a surname that appears within the other).
  return ca.includes(cb) || cb.includes(ca);
}

export function buildMatchRows(
  pdfs: PdfDoc[],
  excelRows: ExcelRow[],
): MatchRow[] {
  const byId = new Map<string, ExcelRow>();
  for (const row of excelRows) {
    if (row.idNo) byId.set(row.idNo, row);
  }

  return pdfs.map((pdf) => {
    const f = pdf.fields;
    const pdfId = normaliseId(f?.idNo ?? "");
    const excel = pdfId ? byId.get(pdfId) : undefined;

    const idMatch = !!excel && normaliseId(excel.idNo) === pdfId && !!pdfId;
    const surnameMatch = !!excel && nameEq(excel.surname, f?.surname ?? "");
    const nameMatch = !!excel && nameEq(excel.name, f?.fullNames ?? "");

    return {
      pdf,
      excel,
      status: excel ? "matched" : "notfound",
      excluded: false,
      idMatch,
      nameMatch,
      surnameMatch,
    } satisfies MatchRow;
  });
}

/** The address a row will actually send to (override wins over the sheet). */
export function effectiveEmail(row: MatchRow): string {
  return (row.emailOverride ?? row.excel?.email ?? "").trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/** A row is ready to send when it isn't excluded, matched, and has a valid email. */
export function isSendable(row: MatchRow): boolean {
  return (
    !row.excluded &&
    row.status === "matched" &&
    isValidEmail(effectiveEmail(row))
  );
}
