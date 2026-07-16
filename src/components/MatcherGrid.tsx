"use client";
import { useState } from "react";
import type { MatchRow } from "@/lib/types";
import { effectiveEmail, isValidEmail } from "@/lib/match";

interface MatcherGridProps {
  rows: MatchRow[];
  onEmailChange: (pdfId: string, email: string) => void;
  onToggleExclude: (pdfId: string) => void;
  /** Encrypt this row's PDF and download it so the user can test the lock. */
  onPreview: (row: MatchRow) => Promise<void>;
  /** Normalised ID numbers that were successfully sent (from the send log). */
  sentIds: Set<string>;
}

function normId(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Small paired cell: Excel value on top, PDF value below, with agreement flag. */
function PairCell({
  excel,
  pdf,
  match,
  hasExcel,
}: {
  excel: string;
  pdf: string;
  match: boolean;
  hasExcel: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        {hasExcel ? (
          <span
            className={
              match
                ? "text-emerald-600"
                : "text-amber-600"
            }
            title={match ? "Matches" : "Differs from PDF"}
          >
            {match ? "✓" : "⚠"}
          </span>
        ) : (
          <span className="text-slate-300">–</span>
        )}
        <span className="truncate text-xs text-slate-500" title={excel}>
          {excel || <span className="italic text-slate-300">no Excel value</span>}
        </span>
      </div>
      <div className="truncate text-sm font-medium text-slate-800" title={pdf}>
        {pdf || <span className="italic text-slate-300">—</span>}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: MatchRow }) {
  if (row.status === "matched") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Matched
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
      Not found
    </span>
  );
}

function EmailCell({
  row,
  onEmailChange,
}: {
  row: MatchRow;
  onEmailChange: (pdfId: string, email: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const value = effectiveEmail(row);
  const valid = isValidEmail(value);
  const overridden = row.emailOverride !== undefined;

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          onEmailChange(row.pdf.id, e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border border-blue-400 px-2 py-1 text-sm outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex w-full items-center gap-1 text-left"
      title="Click to edit"
    >
      <span
        className={`truncate text-sm ${
          value
            ? valid
              ? "text-slate-800"
              : "text-rose-600"
            : "italic text-slate-300"
        }`}
      >
        {value || "no email"}
      </span>
      {overridden && (
        <span className="rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700">
          edited
        </span>
      )}
      <span className="opacity-0 transition-opacity group-hover:opacity-100 text-xs text-blue-500">
        ✎
      </span>
    </button>
  );
}

export default function MatcherGrid({
  rows,
  onEmailChange,
  onToggleExclude,
  onPreview,
  sentIds,
}: MatcherGridProps) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const runPreview = async (row: MatchRow) => {
    setPreviewingId(row.pdf.id);
    try {
      await onPreview(row);
    } finally {
      setPreviewingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        Load PDFs and an Excel sheet to build the match table.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">
              Name <span className="font-normal normal-case text-slate-400">(Excel / PDF)</span>
            </th>
            <th className="px-3 py-2 font-semibold">
              Surname <span className="font-normal normal-case text-slate-400">(Excel / PDF)</span>
            </th>
            <th className="px-3 py-2 font-semibold">
              ID No. <span className="font-normal normal-case text-slate-400">(Excel / PDF)</span>
            </th>
            <th className="px-3 py-2 font-semibold">Email (Excel)</th>
            <th className="px-3 py-2 font-semibold">File</th>
            <th className="px-3 py-2 font-semibold">Send</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const f = row.pdf.fields;
            const hasExcel = !!row.excel;
            const dimmed = row.excluded ? "opacity-40" : "";
            return (
              <tr
                key={row.pdf.id}
                className={`border-b border-slate-100 align-top hover:bg-slate-50 ${dimmed}`}
              >
                <td className="px-3 py-2">
                  <StatusBadge row={row} />
                  {row.pdf.fields?.idNo &&
                    sentIds.has(normId(row.pdf.fields.idNo)) && (
                      <span className="mt-1 block text-[10px] font-semibold text-emerald-600">
                        ✓ already sent
                      </span>
                    )}
                  {row.pdf.error && (
                    <p className="mt-1 max-w-[10rem] text-[10px] text-rose-500">
                      {row.pdf.error}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[12rem]">
                  <PairCell
                    excel={row.excel?.name ?? ""}
                    pdf={f?.fullNames ?? ""}
                    match={row.nameMatch}
                    hasExcel={hasExcel}
                  />
                </td>
                <td className="px-3 py-2 max-w-[12rem]">
                  <PairCell
                    excel={row.excel?.surname ?? ""}
                    pdf={f?.surname ?? ""}
                    match={row.surnameMatch}
                    hasExcel={hasExcel}
                  />
                </td>
                <td className="px-3 py-2 max-w-[10rem]">
                  <PairCell
                    excel={row.excel?.idNo ?? ""}
                    pdf={f?.idNo ?? ""}
                    match={row.idMatch}
                    hasExcel={hasExcel}
                  />
                </td>
                <td className="px-3 py-2 max-w-[14rem]">
                  <EmailCell row={row} onEmailChange={onEmailChange} />
                </td>
                <td className="px-3 py-2 max-w-[12rem]">
                  <span
                    className="block truncate text-xs text-slate-400"
                    title={row.pdf.fileName}
                  >
                    {row.pdf.fileName}
                  </span>
                  {row.pdf.fields?.idNo && (
                    <button
                      onClick={() => runPreview(row)}
                      disabled={previewingId === row.pdf.id}
                      title="Download a password-locked copy to test it opens with the ID number"
                      className="mt-1 inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                    >
                      {previewingId === row.pdf.id ? "Locking…" : "🔒 Test-lock"}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!row.excluded}
                      onChange={() => onToggleExclude(row.pdf.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    include
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
