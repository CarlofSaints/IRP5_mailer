"use client";
import { useCallback, useMemo, useState } from "react";
import Dropzone from "@/components/Dropzone";
import MatcherGrid from "@/components/MatcherGrid";
import EmailComposer from "@/components/EmailComposer";
import { extractIrp5Fields, encryptPdf, toBase64 } from "@/lib/pdf";
import { parseExcel, type ExcelParseResult } from "@/lib/excel";
import { buildMatchRows, effectiveEmail, isSendable, normaliseId } from "@/lib/match";
import {
  DEFAULT_TEMPLATE,
  bodyToHtml,
  fillTemplate,
  placeholderValues,
} from "@/lib/email";
import type { EmailTemplate, PdfDoc } from "@/lib/types";

interface RowOverride {
  emailOverride?: string;
  excluded?: boolean;
}
interface SendResult {
  email: string;
  ok: boolean;
  error?: string;
}

export default function Home() {
  const [pdfs, setPdfs] = useState<PdfDoc[]>([]);
  const [excel, setExcel] = useState<ExcelParseResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[] | null>(null);

  // --- Loaders -----------------------------------------------------------
  const handlePdfFiles = useCallback(async (files: File[]) => {
    const docs: PdfDoc[] = files.map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      file,
    }));
    setPdfs((prev) => [...prev, ...docs]);
    for (const doc of docs) {
      try {
        const fields = await extractIrp5Fields(doc.file);
        setPdfs((prev) =>
          prev.map((p) => (p.id === doc.id ? { ...p, fields } : p)),
        );
      } catch (e) {
        const error = e instanceof Error ? e.message : "Failed to read PDF.";
        setPdfs((prev) =>
          prev.map((p) => (p.id === doc.id ? { ...p, error } : p)),
        );
      }
    }
  }, []);

  const handleExcelFile = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    try {
      const parsed = await parseExcel(files[0]);
      setExcel(parsed);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Failed to read Excel.";
      alert(error);
    }
  }, []);

  // --- Derived match rows (overrides applied) ----------------------------
  const rows = useMemo(() => {
    const base = buildMatchRows(pdfs, excel?.rows ?? []);
    return base.map((r) => ({ ...r, ...overrides[r.pdf.id] }));
  }, [pdfs, excel, overrides]);

  const sendable = rows.filter(isSendable);
  const previewRow = sendable[0] ?? rows.find((r) => r.status === "matched");

  const stats = {
    total: rows.length,
    matched: rows.filter((r) => r.status === "matched").length,
    notfound: rows.filter((r) => r.status === "notfound").length,
    sendable: sendable.length,
  };

  // --- Row actions -------------------------------------------------------
  const onEmailChange = (pdfId: string, email: string) =>
    setOverrides((o) => ({ ...o, [pdfId]: { ...o[pdfId], emailOverride: email } }));
  const onToggleExclude = (pdfId: string) =>
    setOverrides((o) => ({
      ...o,
      [pdfId]: { ...o[pdfId], excluded: !o[pdfId]?.excluded },
    }));

  // --- Send --------------------------------------------------------------
  const handleSend = async () => {
    if (sendable.length === 0) return;
    if (
      !confirm(
        `Encrypt and send ${sendable.length} IRP5${
          sendable.length === 1 ? "" : "s"
        }? Each PDF will be password-locked with the recipient's ID number.`,
      )
    )
      return;

    setSending(true);
    setResults(null);
    setProgress({ done: 0, total: sendable.length });
    const log: SendResult[] = [];

    for (const row of sendable) {
      const to = effectiveEmail(row);
      const password = normaliseId(row.pdf.fields?.idNo ?? "");
      try {
        if (!password) throw new Error("No ID number to use as password.");
        const encrypted = await encryptPdf(row.pdf.file, password);
        const values = placeholderValues(row);
        const text = fillTemplate(template.body, values);
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject: fillTemplate(template.subject, values),
            text,
            html: bodyToHtml(text),
            filename: row.pdf.fileName,
            attachmentBase64: toBase64(encrypted),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Send failed.");
        log.push({ email: to, ok: true });
      } catch (e) {
        log.push({
          email: to,
          ok: false,
          error: e instanceof Error ? e.message : "Send failed.",
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResults(log);
    setSending(false);
  };

  // --- Render ------------------------------------------------------------
  const missingCols = excel?.missing ?? [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">IRP5 Mailer</h1>
        <p className="text-sm text-slate-500">
          Match IRP5 PDFs to staff, password-lock each with the recipient&apos;s
          ID number, and send — all verified before a single email goes out.
        </p>
      </header>

      {/* Loaders */}
      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <Dropzone
          title="1 · IRP5 PDFs"
          hint={`${pdfs.length} loaded`}
          accept=".pdf"
          multiple
          onFiles={handlePdfFiles}
        >
          {pdfs.length > 0 && (
            <p className="text-xs text-slate-500">
              {pdfs.filter((p) => p.fields).length} read ·{" "}
              {pdfs.filter((p) => p.error).length} error(s)
              <button
                onClick={() => {
                  setPdfs([]);
                  setOverrides({});
                }}
                className="ml-2 text-rose-500 hover:underline"
              >
                clear
              </button>
            </p>
          )}
        </Dropzone>

        <Dropzone
          title="2 · Staff Excel sheet"
          hint={excel ? `${excel.rows.length} rows` : "ID number + email + name + surname"}
          accept=".xlsx,.xls,.csv"
          onFiles={handleExcelFile}
        >
          {excel && (
            <div className="text-xs text-slate-500">
              <span>{excel.rows.length} rows loaded</span>
              {missingCols.length > 0 && (
                <p className="mt-1 text-amber-600">
                  ⚠ Could not auto-detect column(s): {missingCols.join(", ")}.
                  Check the header row.
                </p>
              )}
              <button
                onClick={() => setExcel(null)}
                className="ml-2 text-rose-500 hover:underline"
              >
                clear
              </button>
            </div>
          )}
        </Dropzone>
      </section>

      {/* Matcher */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Match &amp; verify</h2>
          {rows.length > 0 && (
            <div className="flex gap-3 text-xs">
              <span className="text-slate-500">{stats.total} total</span>
              <span className="text-emerald-600">{stats.matched} matched</span>
              <span className="text-rose-600">{stats.notfound} not found</span>
              <span className="font-semibold text-blue-600">
                {stats.sendable} ready to send
              </span>
            </div>
          )}
        </div>
        <MatcherGrid
          rows={rows}
          onEmailChange={onEmailChange}
          onToggleExclude={onToggleExclude}
        />
      </section>

      {/* Email composer */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Email</h2>
        <EmailComposer
          template={template}
          onChange={setTemplate}
          previewRow={previewRow}
        />
      </section>

      {/* Send bar */}
      <section className="sticky bottom-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {sending ? (
              <span>
                Sending… {progress.done}/{progress.total}
              </span>
            ) : (
              <span>
                <strong className="text-blue-600">{stats.sendable}</strong> email
                {stats.sendable === 1 ? "" : "s"} ready · each PDF locked with the
                recipient&apos;s ID number
              </span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || stats.sendable === 0}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {sending ? "Sending…" : `Encrypt & Send ${stats.sendable}`}
          </button>
        </div>

        {results && (
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
            <p className="mb-1 font-semibold text-slate-700">
              {results.filter((r) => r.ok).length} sent ·{" "}
              {results.filter((r) => !r.ok).length} failed
            </p>
            <ul className="max-h-32 space-y-0.5 overflow-y-auto">
              {results.map((r, i) => (
                <li key={i} className={r.ok ? "text-emerald-600" : "text-rose-600"}>
                  {r.ok ? "✓" : "✗"} {r.email}
                  {r.error ? ` — ${r.error}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
