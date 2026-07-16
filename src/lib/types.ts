// Shared types for the IRP5 mailer.

/** Fields extracted from a single IRP5 PDF's XFA datasets. */
export interface Irp5Fields {
  idNo: string;
  surname: string;
  fullNames: string;
  initials: string;
  certNo: string;
}

/** A parsed PDF plus its source File handle (kept in memory, never uploaded until send). */
export interface PdfDoc {
  id: string; // stable local id
  fileName: string;
  file: File;
  fields?: Irp5Fields;
  error?: string;
}

/** A row from the loaded Excel sheet, normalised to the columns we care about. */
export interface ExcelRow {
  idNo: string;
  name: string;
  surname: string;
  email: string;
  raw: Record<string, unknown>;
}

export type MatchStatus = "matched" | "notfound";

/** One line in the matcher grid: a PDF joined to its Excel row (if any). */
export interface MatchRow {
  pdf: PdfDoc;
  excel?: ExcelRow;
  status: MatchStatus;
  /** User override for the destination email address. */
  emailOverride?: string;
  /** Whether the user has excluded this row from the send. */
  excluded: boolean;
  // Field-level agreement flags (PDF vs Excel), for eyeball verification.
  idMatch: boolean;
  nameMatch: boolean;
  surnameMatch: boolean;
}

/** The editable email template. */
export interface EmailTemplate {
  subject: string;
  body: string; // may contain {Name} {Surname} {ID} placeholders
}
