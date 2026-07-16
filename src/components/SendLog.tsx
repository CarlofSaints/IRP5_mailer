"use client";
import type { SendLogEntry } from "@/lib/types";

interface SendLogProps {
  entries: SendLogEntry[];
  onClear: () => void;
}

function fmt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SendLog({ entries, onClear }: SendLogProps) {
  if (entries.length === 0) return null;

  const sent = entries.filter((e) => e.ok).length;
  const failed = entries.length - sent;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Send log</h2>
          <p className="text-xs text-slate-500">
            {sent} sent · {failed} failed · persists across refreshes
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-rose-500 hover:underline"
        >
          Clear log
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">When</th>
              <th className="px-4 py-2 font-semibold">Recipient</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">File</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...entries].reverse().map((e, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-1.5 text-slate-500">
                  {fmt(e.ts)}
                </td>
                <td className="px-4 py-1.5 text-slate-700">{e.name || "—"}</td>
                <td className="px-4 py-1.5 text-slate-700">{e.email}</td>
                <td
                  className="max-w-[14rem] truncate px-4 py-1.5 text-slate-400"
                  title={e.fileName}
                >
                  {e.fileName}
                </td>
                <td className="px-4 py-1.5">
                  {e.ok ? (
                    <span className="font-medium text-emerald-600">✓ Sent</span>
                  ) : (
                    <span className="text-rose-600" title={e.error}>
                      ✗ {e.error ?? "Failed"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
