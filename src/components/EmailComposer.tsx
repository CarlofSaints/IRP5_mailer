"use client";
import type { EmailTemplate, MatchRow } from "@/lib/types";
import {
  bodyToHtml,
  fillTemplate,
  placeholderValues,
} from "@/lib/email";

interface EmailComposerProps {
  template: EmailTemplate;
  onChange: (t: EmailTemplate) => void;
  /** First sendable row, used to render a live preview. */
  previewRow?: MatchRow;
}

const PLACEHOLDERS = ["{Name}", "{Surname}", "{ID}", "{Email}"];

export default function EmailComposer({
  template,
  onChange,
  previewRow,
}: EmailComposerProps) {
  const values = previewRow ? placeholderValues(previewRow) : null;
  const previewSubject = values
    ? fillTemplate(template.subject, values)
    : template.subject;
  const previewBody = values
    ? fillTemplate(template.body, values)
    : template.body;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Editor */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Compose email</h2>
        <p className="mb-3 text-xs text-slate-500">
          Placeholders get filled per recipient:{" "}
          {PLACEHOLDERS.map((p) => (
            <code
              key={p}
              className="mr-1 rounded bg-slate-100 px-1 text-[11px] text-slate-600"
            >
              {p}
            </code>
          ))}
        </p>

        <label className="mb-1 block text-xs font-medium text-slate-600">
          Subject
        </label>
        <input
          value={template.subject}
          onChange={(e) => onChange({ ...template, subject: e.target.value })}
          className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
        />

        <label className="mb-1 block text-xs font-medium text-slate-600">
          Body
        </label>
        <textarea
          value={template.body}
          onChange={(e) => onChange({ ...template, body: e.target.value })}
          rows={12}
          className="w-full resize-y rounded border border-slate-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500"
        />
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Preview</h2>
        <p className="mb-3 text-xs text-slate-500">
          {previewRow
            ? `As it will look for ${values?.Name} ${values?.Surname}`
            : "Load data to preview a real recipient."}
        </p>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <p className="mb-2 text-xs text-slate-400">
            To:{" "}
            <span className="text-slate-600">
              {values?.Email || "recipient@example.com"}
            </span>
          </p>
          <p className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
            {previewSubject}
          </p>
          <div
            className="prose prose-sm max-w-none text-sm leading-relaxed text-slate-700 [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: bodyToHtml(previewBody) }}
          />
        </div>
      </div>
    </div>
  );
}
