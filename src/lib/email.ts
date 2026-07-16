// Email template handling: default copy and placeholder substitution.
import type { EmailTemplate, MatchRow } from "./types";
import { effectiveEmail } from "./match";

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: "Your IRP5 for the 2026 financial year",
  body: `Dear {Name} {Surname}

Please find attached your IRP5 for the financial year 2026.

Use your ID number to open the file.

If this is NOT your IRP5, please delete this email and inform management immediately.

Thank you

iRam HR`,
};

/** Values available to the placeholders for a given recipient. */
export function placeholderValues(row: MatchRow): Record<string, string> {
  const f = row.pdf.fields;
  return {
    Name: row.excel?.name || f?.fullNames || "",
    Surname: row.excel?.surname || f?.surname || "",
    // Falls back to passport / alternate ID for foreign nationals with no SA ID.
    ID: f?.idNo || f?.passportNo || f?.altIdNo || row.excel?.idNo || "",
    Email: effectiveEmail(row),
  };
}

/** Replace {Name} {Surname} {ID} {Email} tokens (case-insensitive). */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const found = Object.keys(values).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    return found ? values[found] : whole;
  });
}

/** Render the plain-text body as minimal HTML (paragraphs from blank lines). */
export function bodyToHtml(text: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}
