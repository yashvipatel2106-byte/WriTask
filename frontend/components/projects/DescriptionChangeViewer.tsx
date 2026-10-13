"use client";

import { useEffect, useMemo } from "react";
import { diffWordsWithSpace } from "diff";
import { X } from "lucide-react";

import { avatarBg, avatarInitials } from "@/lib/avatarColor";

export type DescriptionChangeEditor = {
  id: string;
  name: string;
  avatarColor?: string;
};

type Props = {
  previousDescription?: string | null;
  newDescription?: string | null;
  editors: DescriptionChangeEditor[];
  timestamp: string;
  onClose: () => void;
};

/**
 * Descriptions are sanitized HTML (see backend/utils/sanitizeHtml.js —
 * a small allow-listed tag set: p, br, b/strong, i/em, u, s/strike,
 * ul/ol/li, a, blockquote, h1-h4, span). For a readable word-level diff
 * we flatten that down to plain text first, turning block-level tags
 * into line breaks and list items into "• " bullets, then decode HTML
 * entities via a <textarea> (never re-parsed as markup, so this can't
 * execute anything — just decodes text).
 */
function htmlToPlainText(html?: string | null): string {
  if (!html) return "";

  let text = html
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  if (typeof document !== "undefined") {
    const decoder = document.createElement("textarea");
    decoder.innerHTML = text;
    text = decoder.value;
  }

  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

export default function DescriptionChangeViewer({
  previousDescription,
  newDescription,
  editors,
  timestamp,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasChangeDetails = previousDescription != null || newDescription != null;

  const diffParts = useMemo(() => {
    if (!hasChangeDetails) return [];
    const oldText = htmlToPlainText(previousDescription);
    const newText = htmlToPlainText(newDescription);
    return diffWordsWithSpace(oldText, newText);
  }, [previousDescription, newDescription, hasChangeDetails]);

  const hasVisibleDiff = diffParts.some((part) => part.value.trim().length > 0);

  const formattedTimestamp = useMemo(() => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [timestamp]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Description changes"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {formattedTimestamp}
            </span>

            {editors.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Edited by
                </span>
                <div className="flex items-center -space-x-2">
                  {editors.map((editor) => (
                    <div
                      key={editor.id}
                      title={editor.name}
                      className={`w-7 h-7 rounded-full ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                        avatarBg(editor.avatarColor, editor.id || editor.name).className
                      }`}
                      style={avatarBg(editor.avatarColor, editor.id || editor.name).style}
                    >
                      {avatarInitials(editor.name)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm !h-8 !w-8 !px-0 shrink-0"
            aria-label="Close"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasChangeDetails ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Change details unavailable for this activity.
            </p>
          ) : !hasVisibleDiff ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No visible changes.</p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
              {diffParts.map((part, index) => {
                if (part.added) {
                  return (
                    <span
                      key={index}
                      className="rounded bg-emerald-100 px-0.5 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                    >
                      {part.value}
                    </span>
                  );
                }

                if (part.removed) {
                  return (
                    <span
                      key={index}
                      className="rounded bg-red-100 px-0.5 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                    >
                      {part.value}
                    </span>
                  );
                }

                return <span key={index}>{part.value}</span>;
              })}
            </p>
          )}
        </div>

        {hasChangeDetails && hasVisibleDiff && (
          <div className="flex items-center gap-4 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-100 dark:bg-red-500/20" />
              Removed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-100 dark:bg-emerald-500/20" />
              Added
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
