"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Dropzone from "@/components/Dropzone";
import MatcherGrid from "@/components/MatcherGrid";
import EmailComposer from "@/components/EmailComposer";
import ColumnPicker from "@/components/ColumnPicker";
import SendLog from "@/components/SendLog";
import { extractIrp5Fields, encryptPdf, toBase64 } from "@/lib/pdf";
import {
  loadState,
  savePdfs,
  saveExcel,
  saveTemplate,
  saveOverrides,
  saveMapOverride,
  saveSendLog,
  storageAvailable,
  clearAll,
} from "@/lib/store";
import {
  parseExcel,
  buildExcelRows,
  missingCols,
  type ExcelData,
  type ColMap,
  type LogicalCol,
} from "@/lib/excel";
import {
  buildMatchRows,
  effectiveEmail,
  isSendable,
  normaliseId,
} from "@/lib/match";
import type { MatchRow } from "@/lib/types";
import {
  DEFAULT_TEMPLATE,
  bodyToHtml,
  fillTemplate,
  placeholderValues,
} from "@/lib/email";
import type { EmailTemplate, PdfDoc, SendLogEntry } from "@/lib/types";

interface RowOverride {
  emailOverride?: string;
  excluded?: boolean;
}
interface SendResult {
  email: string;
  ok: boolean;
  error?: string;
}

/** Persist `value` to IndexedDB (debounced), but only after initial hydration. */
function useDebouncedSave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  ready: boolean,
  onResult: (ok: boolean) => void,
  delay = 400,
) {
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      save(value)
        .then(() => onResult(true))
        .catch(() => onResult(false));
    }, delay);
    return () => clearTimeout(t);
  }, [value, save, ready, onResult, delay]);
}

export default function Home() {
  const [pdfs, setPdfs] = useState<PdfDoc[]>([]);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [mapOverride, setMapOverride] = useState<Partial<ColMap>>({});
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE);
  const [sendLog, setSendLog] = useState<SendLogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dupNotice, setDupNotice] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const onSaveResult = useCallback((ok: boolean) => {
    setStorageOk(ok);
    if (ok) setLastSaved(Date.now());
  }, []);

  // --- Rehydrate from IndexedDB on first mount ---------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await storageAvailable();
        if (!cancelled) setStorageOk(ok);
        const s = await loadState();
        if (cancelled) return;
        setPdfs(s.pdfs);
        setExcelData(s.excel);
        setMapOverride(s.mapOverride);
        setOverrides(s.overrides);
        if (s.template) setTemplate(s.template);
        setSendLog(s.sendLog);
      } catch {
        if (!cancelled) setStorageOk(false);
      } finally {
        // Always mark hydrated so saving still works even if the load failed.
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Persist each slice as it changes (after hydration) ----------------
  useDebouncedSave(pdfs, savePdfs, hydrated, onSaveResult);
  useDebouncedSave(excelData, saveExcel, hydrated, onSaveResult);
  useDebouncedSave(mapOverride, saveMapOverride, hydrated, onSaveResult);
  useDebouncedSave(overrides, saveOverrides, hydrated, onSaveResult);
  useDebouncedSave(template, saveTemplate, hydrated, onSaveResult);
  useDebouncedSave(sendLog, saveSendLog, hydrated, onSaveResult);

  // --- Loaders -----------------------------------------------------------
  // Identity signature for a file — catches the same file loaded twice.
  const fileSig = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

  const handlePdfFiles = useCallback(
    async (files: File[]) => {
      const existing = new Set(pdfs.map((p) => fileSig(p.file)));
      const fresh: PdfDoc[] = [];
      for (const file of files) {
        const sig = fileSig(file);
        if (existing.has(sig)) continue; // already loaded (or dup within batch)
        existing.add(sig);
        fresh.push({ id: crypto.randomUUID(), fileName: file.name, file });
      }

      const skipped = files.length - fresh.length;
      setDupNotice(
        skipped > 0
          ? `Skipped ${skipped} duplicate file${skipped === 1 ? "" : "s"} already loaded.`
          : null,
      );
      if (fresh.length === 0) return;

      setPdfs((prev) => [...prev, ...fresh]);
      for (const doc of fresh) {
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
    },
    [pdfs],
  );

  const handleExcelFile = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    try {
      const parsed = await parseExcel(files[0]);
      setExcelData(parsed);
      setMapOverride({}); // reset manual mapping for the new sheet
    } catch (e) {
      const error = e instanceof Error ? e.message : "Failed to read Excel.";
      alert(error);
    }
  }, []);

  // --- Excel: effective column mapping + rows -----------------------------
  const mapping: ColMap | null = useMemo(
    () => (excelData ? { ...excelData.autoMapping, ...mapOverride } : null),
    [excelData, mapOverride],
  );
  const excelRows = useMemo(
    () => (excelData && mapping ? buildExcelRows(excelData, mapping) : []),
    [excelData, mapping],
  );
  const missing = mapping ? missingCols(mapping) : [];

  // --- Derived match rows (overrides applied) ----------------------------
  const rows = useMemo(() => {
    const base = buildMatchRows(pdfs, excelRows);
    return base.map((r) => ({ ...r, ...overrides[r.pdf.id] }));
  }, [pdfs, excelRows, overrides]);

  const sendable = rows.filter(isSendable);
  const previewRow = sendable[0] ?? rows.find((r) => r.status === "matched");

  // Successfully-sent ID numbers (from the persistent log).
  const sentIds = useMemo(
    () =>
      new Set(
        sendLog.filter((e) => e.ok).map((e) => normaliseId(e.idNo)),
      ),
    [sendLog],
  );

  // ID numbers that appear on more than one loaded PDF (possible duplicates).
  const dupIdSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pdfs) {
      const id = normaliseId(p.fields?.idNo ?? "");
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    );
  }, [pdfs]);

  const notFoundIds = rows
    .filter((r) => r.status === "notfound")
    .map((r) => r.pdf.id);
  const allNotFoundExcluded =
    notFoundIds.length > 0 &&
    notFoundIds.every((id) => overrides[id]?.excluded);

  const stats = {
    total: rows.length,
    matched: rows.filter((r) => r.status === "matched").length,
    notfound: rows.filter((r) => r.status === "notfound").length,
    sendable: sendable.length,
  };

  const excludeAllNotFound = (exclude: boolean) =>
    setOverrides((o) => {
      const next = { ...o };
      for (const id of notFoundIds) {
        next[id] = { ...next[id], excluded: exclude };
      }
      return next;
    });

  // --- Row actions -------------------------------------------------------
  const onEmailChange = (pdfId: string, email: string) =>
    setOverrides((o) => ({ ...o, [pdfId]: { ...o[pdfId], emailOverride: email } }));
  const onToggleExclude = (pdfId: string) =>
    setOverrides((o) => ({
      ...o,
      [pdfId]: { ...o[pdfId], excluded: !o[pdfId]?.excluded },
    }));

  const onMapChange = (col: LogicalCol, index: number) =>
    setMapOverride((m) => ({ ...m, [col]: index }));

  // Encrypt one PDF client-side and download it so the user can confirm it
  // opens with the ID number (verify in Adobe Reader — same as recipients).
  const handlePreview = async (row: MatchRow) => {
    const password = normaliseId(row.pdf.fields?.idNo ?? "");
    if (!password) {
      alert("No ID number on this PDF to use as the password.");
      return;
    }
    const encrypted = await encryptPdf(row.pdf.file, password);
    const blob = new Blob([new Uint8Array(encrypted)], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LOCKED_${row.pdf.fileName}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

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
    // Hard guard: at most one successful email per ID number, per run.
    // Rows are in load order, so the first-loaded copy is the one that sends.
    const sentThisRun = new Set<string>();

    for (const row of sendable) {
      const to = effectiveEmail(row);
      const password = normaliseId(row.pdf.fields?.idNo ?? "");
      const values = placeholderValues(row);

      if (password && sentThisRun.has(password)) {
        // A copy of this ID already went out this run — skip, don't re-send.
        log.push({
          email: to,
          ok: false,
          error: "Skipped — duplicate ID (first copy already sent)",
        });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      let ok = false;
      let error: string | undefined;
      try {
        if (!password) throw new Error("No ID number to use as password.");
        const encrypted = await encryptPdf(row.pdf.file, password);
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
        ok = true;
      } catch (e) {
        error = e instanceof Error ? e.message : "Send failed.";
      }
      if (ok && password) sentThisRun.add(password);
      log.push({ email: to, ok, error });
      // Append to the persistent send log (actual send attempts only).
      const entry: SendLogEntry = {
        ts: Date.now(),
        idNo: password,
        name: `${values.Name} ${values.Surname}`.trim(),
        email: to,
        fileName: row.pdf.fileName,
        ok,
        error,
      };
      setSendLog((prev) => [...prev, entry]);
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResults(log);
    setSending(false);
  };

  const handleStartOver = async () => {
    if (
      !confirm(
        "Clear all loaded PDFs, the Excel sheet, edits and the send log from this browser? This cannot be undone.",
      )
    )
      return;
    await clearAll();
    setPdfs([]);
    setExcelData(null);
    setMapOverride({});
    setOverrides({});
    setSendLog([]);
    setTemplate(DEFAULT_TEMPLATE);
    setResults(null);
  };

  // --- Render ------------------------------------------------------------
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IRP5 Mailer</h1>
          <p className="text-sm text-slate-500">
            Match IRP5 PDFs to staff, password-lock each with the
            recipient&apos;s ID number, and send — all verified before a single
            email goes out.
          </p>
          {storageOk === false ? (
            <p className="mt-1 text-xs font-medium text-rose-600">
              ⚠ This browser isn&apos;t saving data (private/incognito mode, or
              storage blocked). Your work will be lost on refresh.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Saved in this browser &amp; survives refresh
              {lastSaved
                ? ` · last saved ${new Date(lastSaved).toLocaleTimeString()}`
                : ""}
              .
            </p>
          )}
        </div>
        {(pdfs.length > 0 || excelData || sendLog.length > 0) && (
          <button
            onClick={handleStartOver}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-rose-400 hover:text-rose-600"
          >
            Start over
          </button>
        )}
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
                  setDupNotice(null);
                }}
                className="ml-2 text-rose-500 hover:underline"
              >
                clear
              </button>
            </p>
          )}
          {dupNotice && (
            <p className="mt-1 text-xs text-amber-600">⚠ {dupNotice}</p>
          )}
        </Dropzone>

        <Dropzone
          title="2 · Staff Excel sheet"
          hint={
            excelData
              ? `${excelRows.length} rows`
              : "ID number + email + name + surname"
          }
          accept=".xlsx,.xls,.csv"
          onFiles={handleExcelFile}
        >
          {excelData && mapping && (
            <div className="text-xs text-slate-500">
              <span>
                {excelData.fileName}
                {excelData.sheetName ? ` · sheet “${excelData.sheetName}”` : ""} ·{" "}
                {excelRows.length} rows
              </span>
              <button
                onClick={() => {
                  setExcelData(null);
                  setMapOverride({});
                }}
                className="ml-2 text-rose-500 hover:underline"
              >
                clear
              </button>
              {missing.length > 0 && (
                <p className="mt-1 text-amber-600">
                  ⚠ Couldn&apos;t auto-detect: {missing.join(", ")}. Set it below.
                </p>
              )}
              <ColumnPicker
                headers={excelData.headers}
                mapping={mapping}
                onChange={onMapChange}
              />
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
        {stats.notfound > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <input
              id="exclude-notfound"
              type="checkbox"
              checked={allNotFoundExcluded}
              onChange={(e) => excludeAllNotFound(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            <label htmlFor="exclude-notfound" className="cursor-pointer">
              Exclude all <strong>{stats.notfound}</strong> &ldquo;Not
              found&rdquo; PDF{stats.notfound === 1 ? "" : "s"} from sending
              (they stay listed below)
            </label>
          </div>
        )}
        <MatcherGrid
          rows={rows}
          onEmailChange={onEmailChange}
          onToggleExclude={onToggleExclude}
          onPreview={handlePreview}
          sentIds={sentIds}
          dupIdSet={dupIdSet}
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
              {results.filter((r) => !r.ok && r.error?.startsWith("Skipped"))
                .length}{" "}
              skipped ·{" "}
              {
                results.filter(
                  (r) => !r.ok && !r.error?.startsWith("Skipped"),
                ).length
              }{" "}
              failed
            </p>
            <ul className="max-h-32 space-y-0.5 overflow-y-auto">
              {results.map((r, i) => {
                const skipped = !r.ok && r.error?.startsWith("Skipped");
                const cls = r.ok
                  ? "text-emerald-600"
                  : skipped
                    ? "text-amber-600"
                    : "text-rose-600";
                return (
                  <li key={i} className={cls}>
                    {r.ok ? "✓" : skipped ? "⊘" : "✗"} {r.email}
                    {r.error ? ` — ${r.error}` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Send log (persistent) */}
      <section className="mt-8">
        <SendLog entries={sendLog} onClear={() => setSendLog([])} />
      </section>
    </main>
  );
}
