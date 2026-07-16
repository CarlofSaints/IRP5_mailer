"use client";
import {
  COL_LABELS,
  LOGICAL_COLS,
  type ColMap,
  type LogicalCol,
} from "@/lib/excel";

interface ColumnPickerProps {
  headers: string[];
  mapping: ColMap;
  onChange: (col: LogicalCol, index: number) => void;
}

/** Lets the user correct which spreadsheet column feeds each logical field. */
export default function ColumnPicker({
  headers,
  mapping,
  onChange,
}: ColumnPickerProps) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium text-slate-600">
        Column mapping{" "}
        <span className="font-normal text-slate-400">
          — auto-detected, adjust if wrong
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOGICAL_COLS.map((col) => {
          const value = mapping[col];
          const unset = value < 0;
          return (
            <label key={col} className="block text-xs">
              <span
                className={`mb-1 block font-medium ${
                  unset ? "text-amber-600" : "text-slate-600"
                }`}
              >
                {COL_LABELS[col]}
                {unset && " ⚠"}
              </span>
              <select
                value={value}
                onChange={(e) => onChange(col, Number(e.target.value))}
                className={`w-full rounded border bg-white px-2 py-1 text-xs outline-none focus:border-blue-500 ${
                  unset ? "border-amber-400" : "border-slate-300"
                }`}
              >
                <option value={-1}>— none —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
