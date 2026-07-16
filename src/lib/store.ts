// Local persistence via IndexedDB (idb-keyval). Keeps loaded PDFs, the parsed
// Excel data, the email template, per-row edits and the send log across page
// refreshes — no account or server needed. Everything stays on the machine.
import { get, set, clear } from "idb-keyval";
import type { EmailTemplate, PdfDoc, SendLogEntry } from "./types";
import type { ColMap, ExcelData } from "./excel";

interface RowOverride {
  emailOverride?: string;
  excluded?: boolean;
}

const K = {
  pdfs: "irp5.pdfs",
  excel: "irp5.excel",
  template: "irp5.template",
  overrides: "irp5.overrides",
  mapOverride: "irp5.mapOverride",
  log: "irp5.sendLog",
} as const;

export interface PersistedState {
  pdfs: PdfDoc[];
  excel: ExcelData | null;
  template: EmailTemplate | null;
  overrides: Record<string, RowOverride>;
  mapOverride: Partial<ColMap>;
  sendLog: SendLogEntry[];
}

export async function loadState(): Promise<PersistedState> {
  const [pdfs, excel, template, overrides, mapOverride, sendLog] =
    await Promise.all([
      get<PdfDoc[]>(K.pdfs),
      get<ExcelData>(K.excel),
      get<EmailTemplate>(K.template),
      get<Record<string, RowOverride>>(K.overrides),
      get<Partial<ColMap>>(K.mapOverride),
      get<SendLogEntry[]>(K.log),
    ]);
  return {
    pdfs: pdfs ?? [],
    excel: excel ?? null,
    template: template ?? null,
    overrides: overrides ?? {},
    mapOverride: mapOverride ?? {},
    sendLog: sendLog ?? [],
  };
}

export const savePdfs = (v: PdfDoc[]) => set(K.pdfs, v);
export const saveExcel = (v: ExcelData | null) => set(K.excel, v);
export const saveTemplate = (v: EmailTemplate) => set(K.template, v);
export const saveOverrides = (v: Record<string, RowOverride>) =>
  set(K.overrides, v);
export const saveMapOverride = (v: Partial<ColMap>) => set(K.mapOverride, v);
export const saveSendLog = (v: SendLogEntry[]) => set(K.log, v);

/** Wipe all persisted data (the "start over" button). */
export const clearAll = () => clear();
