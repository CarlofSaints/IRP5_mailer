// PDF handling: extract IRP5 fields from the XFA datasets, and password-encrypt.
// Everything here runs client-side in the browser. Confidential PDFs never
// leave the user's machine unencrypted.
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  decodePDFRawStream,
  PDFRawStream,
} from "@cantoo/pdf-lib";
import type { Irp5Fields } from "./types";

/** Pull the raw XFA "datasets" XML out of an IRP5 PDF. */
function getXfaDatasetsXml(doc: PDFDocument): string | null {
  const acro = doc.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
  if (!acro) return null;
  const xfa = acro.lookup(PDFName.of("XFA"));

  const decode = (stream: unknown): string => {
    const decoded = decodePDFRawStream(stream as PDFRawStream).decode();
    return new TextDecoder().decode(decoded);
  };

  if (xfa instanceof PDFArray) {
    // XFA is an array of alternating [name, stream] pairs.
    for (let i = 0; i < xfa.size(); i += 2) {
      const name = xfa.lookup(i);
      const stream = xfa.lookup(i + 1);
      if ((name?.toString?.() ?? "").includes("datasets")) {
        return decode(stream);
      }
    }
    return null;
  }
  // Single-stream XFA: the whole packet, datasets included.
  return xfa ? decode(xfa) : null;
}

/** Read the text value of the first matching XML element name. */
function xmlValue(xml: string, tag: string): string {
  // Only look inside the <xfa:data> section (actual values, not the schema).
  const dataStart = xml.indexOf("<xfa:data");
  const hay = dataStart >= 0 ? xml.slice(dataStart) : xml;
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`);
  const m = re.exec(hay);
  return m ? m[1].trim() : "";
}

/**
 * Extract the fields we need from an IRP5 PDF.
 * SARS IRP5/IT3(a) forms are XFA (LiveCycle) forms; the filled values live in
 * the XFA datasets XML under SARS element names.
 */
export async function extractIrp5Fields(file: File): Promise<Irp5Fields> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const xml = getXfaDatasetsXml(doc);
  if (!xml) {
    throw new Error(
      "No XFA form data found — this may not be a standard SARS IRP5 PDF.",
    );
  }
  const idNo = xmlValue(xml, "ID_NO");
  const surname = xmlValue(xml, "SURNAME");
  const fullNames = xmlValue(xml, "FULL_NAMES");
  const initials = xmlValue(xml, "INITIALS");
  const certNo = xmlValue(xml, "IRP5_CERT_NO");

  if (!idNo && !surname) {
    throw new Error("Could not read ID number or surname from the form data.");
  }
  return { idNo, surname, fullNames, initials, certNo };
}

/**
 * Return a password-protected copy of the PDF. The open (user) password is the
 * supplied value (the recipient's ID number by default).
 */
export async function encryptPdf(
  file: File,
  password: string,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  await doc.encrypt({
    userPassword: password,
    ownerPassword: password + "::owner",
  });
  return doc.save();
}

/** Uint8Array -> base64 (for JSON transport to the send API). */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
