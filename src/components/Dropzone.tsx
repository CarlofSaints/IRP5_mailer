"use client";
import { useCallback, useRef, useState } from "react";

interface DropzoneProps {
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children?: React.ReactNode;
}

export default function Dropzone({
  title,
  hint,
  accept,
  multiple = false,
  onFiles,
  children,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`m-3 cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <p className="text-sm font-medium text-slate-600">
          Drop {multiple ? "files" : "a file"} here, or click to browse
        </p>
        <p className="mt-1 text-xs text-slate-400">{accept}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = ""; // allow re-selecting same file
          }}
        />
      </div>

      {children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
