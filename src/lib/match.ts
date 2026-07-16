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

export interface LockIdentifier {
  value: string; // the actual open-password
  source: "custom" | "ID number" | "passport" | "alternate ID" | "none";
}

/**
 * The identifier used to password-lock this person's PDF, with fallbacks:
 * a manual override, else the SA ID number, else passport, else alternate ID.
 * Foreign nationals have no ID_NO but do carry a passport / alternate ID.
 */
export function lockIdentifier(row: MatchRow): LockIdentifier {
  const custom = (row.passwordOverride ?? "").trim();
  if (custom) return { value: custom, source: "custom" };

  const f = row.pdf.fields;
  const id = normaliseId(f?.idNo ?? "");
  if (id) return { value: id, source: "ID number" };

  const passport = (f?.passportNo ?? "").trim();
  if (passport) return { value: passport, source: "passport" };

  const alt = (f?.altIdNo ?? "").trim();
  if (alt) return { value: alt, source: "alternate ID" };

  return { value: "", source: "none" };
}

/** Canonical key for dedup / sent-tracking — works for digits and passports. */
export function idKey(value: string): string {
  return (value ?? "").trim().toUpperCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/**
 * A row is ready to send when it isn't excluded, we read an ID number from the
 * PDF (needed as the password), and it has a valid destination email.
 *
 * Note: this does NOT require an Excel match. A "Not found" PDF (person absent
 * from the sheet) still sends if the user manually supplies a valid email and
 * leaves it included — the name/ID come from the PDF itself.
 */
export function isSendable(row: MatchRow): boolean {
  return (
    !row.excluded &&
    !!lockIdentifier(row).value &&
    isValidEmail(effectiveEmail(row))
  );
}
