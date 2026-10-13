"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "jodit/es2021/jodit.min.css";
import { Jodit } from "jodit/esm/jodit";

// Jodit manipulates the DOM directly and has no SSR-safe render path — same
// reason TaskDetailDialog itself (which is where this is used) is loaded via
// next/dynamic with ssr:false in KanbanBoard.tsx.
const JoditEditor = dynamic(() => import("jodit-react"), { ssr: false });


type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/** Minimal toolbar matching the old custom Bold/Italic/Underline/Strikethrough
 * set plus basic lists/links — not Jodit's full kitchen sink. Image/file
 * upload buttons are deliberately excluded: attachments stay on the
 * existing separate paste-to-attach system (uploadDescriptionAttachment in
 * TaskDetailDialog.tsx), not inline <img> tags from the editor. */
const TOOLBAR_BUTTONS = [
  "bold", "italic", "underline", "strikethrough", "|",
  "ul", "ol", "|",
  "link", "|",
  "undo", "redo",
];

/** Treat rich-text empty placeholders as blank so init noise does not dirty the form. */
function normalizeEmptyHtml(html: string): string {
  const raw = (html || "").trim();
  if (!raw) return "";
  const stripped = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/<div>\s*<\/div>/gi, "")
    .replace(/\s+/g, "")
    .trim();
  return stripped === "" ? "" : html;
}

export default function JoditDescriptionEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Add a description...",
}: Props) {
  // jodit-react syncs the `value` prop into the editor instance. If we echo
  // every onChange back as `value`, opening Insert Link (or any popup) loses
  // focus / remounts and the dialog closes immediately. Keep a stable seed
  // for the editor and only remount when the parent changes content from
  // outside (e.g. switching tasks).
  const lastEmittedRef = useRef(value);
  const [editorSeed, setEditorSeed] = useState(value);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    // Parent cleared / replaced content from outside (task switch, reset).
    if (
      normalizeEmptyHtml(value) === normalizeEmptyHtml(lastEmittedRef.current)
    ) {
      lastEmittedRef.current = value;
      return;
    }
    lastEmittedRef.current = value;
    setEditorSeed(value);
    setEditorKey((k) => k + 1);
  }, [value]);

  const config = useMemo(
    () => ({
      readonly: disabled,
      placeholder,
      buttons: TOOLBAR_BUTTONS,
      buttonsMD: TOOLBAR_BUTTONS,
      buttonsSM: TOOLBAR_BUTTONS,
      buttonsXS: TOOLBAR_BUTTONS,
      toolbarAdaptive: false,
      showCharsCounter: false,
      showWordsCounter: false,
      showXPathInStatusbar: false,
      scrolling: true,
      statusbar: false,
      // With a fixed `height` set, Jodit's resize-handler plugin force-shows
      // the statusbar (ignoring statusbar:false) just to host its resize
      // handle — showing as a stray gray bar under the text area. Disabling
      // vertical resize removes the handle and keeps the statusbar hidden.
      allowResizeY: false,
      // The toolbar defaults to position:sticky/fixed so it stays visible
      // while scrolling past long content — pointless (and glitchy: buttons
      // like the list icons render clipped to a sliver) for this compact
      // 200px editor embedded inside a modal dialog's own nested scroll
      // container. It never needs to "stick" since the whole editor is
      // always fully in view.
      toolbarSticky: false,
      // height: 200,
      minHeight: 150,
      spellcheck: true,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      // Images are handled by the app's own attachment system, not Jodit's.
      uploader: { insertImageAsBase64URI: false },
      removeButtons: ["image", "file", "video"],
      // Render popups/dialogs on <body> so overflow:hidden modal shells don't
      // clip them, and keep them above TaskDetailDialog (z-50).
      popupRoot: typeof document !== "undefined" ? document.body : null,
      zIndex: 100000,
    }),
    [disabled, placeholder]
  );

  const emitChange = (html: string) => {
    const normalized = normalizeEmptyHtml(html);
    const previous = normalizeEmptyHtml(lastEmittedRef.current);
    // Ignore editor init / blur noise that turns "" into <p><br></p>.
    if (normalized === previous) {
      lastEmittedRef.current = html;
      return;
    }
    lastEmittedRef.current = normalized || html;
    onChange(normalized);
  };

  return (
    <div className={`jodit-description-editor ${disabled ? "is-readonly" : ""}`}>
      <style>{`
        /* Match the app's borderless-card look instead of Jodit's stock skin */
        .jodit-description-editor .jodit-container:not(.jodit_inline) {
          border: none !important;
          border-radius: 0 !important;
          background: transparent !important;
        }
        .jodit-description-editor .jodit-toolbar__box {
          background: transparent !important;
          border-bottom: 1px solid rgb(226 232 240 / 0.8) !important;
        }
        /* .jodit-workplace wraps .jodit-wysiwyg and carries its own white
           background from Jodit's default skin (--jd-color-background-default)
           — transparent on the wysiwyg element alone lets that white show
           through underneath it, most visible in dark mode. */
        .jodit-description-editor .jodit-workplace {
          background: transparent !important;
          max-height: 300px !important;
          overflow-y: auto !important;
        }
        /* Belt-and-suspenders: allowResizeY:false in config already stops
           Jodit's resize-handler plugin from force-showing this (it normally
           ignores statusbar:false just to host its resize-handle icon), but
           hide it outright too in case anything else re-triggers it. */
        .jodit-description-editor .jodit-status-bar {
          display: none !important;
        }
        .jodit-description-editor .jodit-wysiwyg {
          background: transparent !important;
          color: rgb(15 23 42) !important;
          padding: 0.625rem 0.75rem !important;
        }
        /* Pasted/inline images must not float over neighbouring text */
        .jodit-description-editor .jodit-wysiwyg img {
          float: none !important;
          clear: both !important;
          display: block !important;
          max-width: 100% !important;
          height: auto !important;
          margin: 0.5rem 0 !important;
          border-radius: 0.5rem !important;
          border: 1px solid rgb(226 232 240) !important;
        }
        .dark .jodit-description-editor .jodit-wysiwyg img {
          border-color: rgb(51 65 85) !important;
        }
        .jodit-description-editor .jodit-placeholder {
          color: rgb(148 163 184) !important;
        }
        .jodit-description-editor.is-readonly .jodit-toolbar__box {
          display: none !important;
        }

        /* Toolbar buttons (Bold/Italic/lists/link/undo…) render via
           .jodit-toolbar-button/.jodit-toolbar-content, not .jodit-ui-button
           — same DOM family as the popups, just persistently visible instead
           of only appearing in a dropdown. */
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button,
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content,
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"],
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"] {
          background: transparent !important;
          color: rgb(71 85 105) !important;
        }
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button svg,
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content svg,
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"] svg,
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"] svg,
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button svg path,
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content svg path {
          fill: rgb(71 85 105) !important;
          stroke: rgb(71 85 105) !important;
        }
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button:hover,
        .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content:hover,
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"]:hover,
        .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"]:hover {
          background: rgb(6 182 212 / 0.08) !important;
          color: rgb(14 116 144) !important;
        }

        .dark .jodit-description-editor .jodit-toolbar__box {
          border-bottom-color: rgb(51 65 85 / 0.8) !important;
        }
        .dark .jodit-description-editor .jodit-wysiwyg {
          color: rgb(241 245 249) !important;
        }
        .dark .jodit-description-editor .jodit-placeholder {
          color: rgb(100 116 139) !important;
        }
        .dark .jodit-description-editor .jodit-ui-button {
          color: rgb(203 213 225) !important;
        }
        .dark .jodit-description-editor .jodit-ui-button:hover {
          background: rgb(51 65 85) !important;
        }
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button,
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content,
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"],
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"] {
          color: rgb(203 213 225) !important;
        }
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button svg,
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content svg,
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"] svg,
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"] svg,
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button svg path,
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content svg path {
          fill: rgb(203 213 225) !important;
          stroke: rgb(203 213 225) !important;
        }
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-button:hover,
        .dark .jodit-description-editor .jodit-toolbar__box .jodit-toolbar-content:hover,
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-button_variant"]:hover,
        .dark .jodit-description-editor .jodit-toolbar__box [class*="jodit-toolbar-content_variant"]:hover {
          background: rgb(34 211 238 / 0.12) !important;
          color: rgb(103 232 249) !important;
        }
        /* A toggled/open toolbar button (e.g. the list-style dropdown while
           its popup is open) gets aria-pressed="true" — Jodit's own CSS
           targets that attribute globally (unscoped, not theme-aware) with a
           light gray hsla(0,0%,86%,.4) background, showing as a stray white
           box in dark mode regardless of our button color overrides above. */
        .dark .jodit-description-editor .jodit-toolbar__box [aria-pressed="true"]:not([disabled]) {
          background-color: rgb(34 211 238 / 0.15) !important;
          color: rgb(103 232 249) !important;
        }

        /* Everything below targets Jodit's popups/dialogs (list-style picker,
           link insert form, etc.) — deliberately NOT scoped under
           .jodit-description-editor. The editor is configured with
           popupRoot: document.body (so popups escape the modal's
           overflow:hidden and stack above it), which mounts them as direct
           children of <body>, outside this component's own DOM subtree —
           a .jodit-description-editor ancestor selector would never match. */
        .jodit-popup {
          border-radius: 0.75rem !important;
          border: 1px solid rgb(226 232 240) !important;
          box-shadow: 0 10px 30px -5px rgb(0 0 0 / 0.15) !important;
          font-family: inherit !important;
        }
        .jodit-toolbar-editor-collection {
          background: transparent !important;
        }
        .jodit-ui-list {
          padding: 0.25rem !important;
        }
        .jodit-ui-list .jodit-toolbar-button {
          border-radius: 0.5rem !important;
        }
        .jodit-ui-list .jodit-toolbar-button__button {
          color: rgb(51 65 85) !important;
          font-family: inherit !important;
        }
        .jodit-ui-list .jodit-toolbar-button__button:hover {
          background: rgb(6 182 212 / 0.08) !important;
          color: rgb(14 116 144) !important;
        }

        /* List-style picker (Default/Circle/Dot/Square, opened from the ul/ol
           toolbar buttons) renders as a ToolbarCollection popup, a separate
           DOM family (.jodit-toolbar-*) from the .jodit-ui-list-based link
           dialog above — needs its own overrides or it stays on Jodit's
           stock grey/black skin. */
        .jodit-popup .jodit-toolbar-editor-collection {
          background: transparent !important;
          padding: 0.25rem !important;
          gap: 0.125rem !important;
        }
        .jodit-popup .jodit-toolbar-button,
        .jodit-popup .jodit-toolbar-content,
        .jodit-popup [class*="jodit-toolbar-button_variant"],
        .jodit-popup [class*="jodit-toolbar-content_variant"] {
          background: transparent !important;
          color: rgb(51 65 85) !important;
          border-radius: 0.5rem !important;
          font-family: inherit !important;
        }
        .jodit-popup .jodit-toolbar-button svg,
        .jodit-popup .jodit-toolbar-content svg {
          fill: rgb(51 65 85) !important;
          stroke: rgb(51 65 85) !important;
        }
        .jodit-popup .jodit-toolbar-button:hover,
        .jodit-popup .jodit-toolbar-content:hover,
        .jodit-popup [class*="jodit-toolbar-button_variant"]:hover,
        .jodit-popup [class*="jodit-toolbar-content_variant"]:hover {
          background: rgb(6 182 212 / 0.08) !important;
          color: rgb(14 116 144) !important;
        }
        .jodit-popup .jodit-toolbar-button:hover svg,
        .jodit-popup .jodit-toolbar-content:hover svg {
          fill: rgb(14 116 144) !important;
          stroke: rgb(14 116 144) !important;
        }
        .jodit-ui-block,
        .jodit-ui-input__label {
          font-family: inherit !important;
        }
        .jodit-ui-input__label {
          color: rgb(100 116 139) !important;
        }
        .jodit-ui-input__wrapper {
          border-radius: 0.625rem !important;
          border-color: rgb(226 232 240) !important;
          background: rgb(248 250 252) !important;
        }
        .jodit-ui-input_focused_true .jodit-ui-input__wrapper {
          border-color: rgb(34 211 238) !important;
          box-shadow: 0 0 0 3px rgb(34 211 238 / 0.15) !important;
        }
        .jodit-ui-input__input {
          color: rgb(15 23 42) !important;
          font-family: inherit !important;
        }
        .jodit-ui-checkbox__wrapper {
          accent-color: rgb(6 182 212) !important;
        }
        .jodit-ui-button-variants_variant_primary {
          background: rgb(6 182 212) !important;
          border-color: rgb(6 182 212) !important;
          border-radius: 0.625rem !important;
          font-family: inherit !important;
        }
        .jodit-ui-button-variants_variant_primary:hover:not([disabled]) {
          background: rgb(8 145 178) !important;
        }

        .dark .jodit-popup,
        .dark .jodit-dialog {
          background: rgb(30 41 59) !important;
          color: rgb(241 245 249) !important;
          border-color: rgb(51 65 85) !important;
          box-shadow: 0 10px 30px -5px rgb(0 0 0 / 0.4) !important;
        }
        .dark .jodit-toolbar-editor-collection_mode_horizontal {
          background: rgb(30 41 59) !important;
          color: rgb(241 245 249) !important;
        }
        .dark .jodit-ui-list .jodit-toolbar-button__button {
          color: rgb(203 213 225) !important;
        }
        .dark .jodit-ui-list .jodit-toolbar-button__button:hover {
          background: rgb(34 211 238 / 0.12) !important;
          color: rgb(103 232 249) !important;
        }
        .dark .jodit-popup .jodit-toolbar-button,
        .dark .jodit-popup .jodit-toolbar-content,
        .dark .jodit-popup [class*="jodit-toolbar-button_variant"],
        .dark .jodit-popup [class*="jodit-toolbar-content_variant"] {
          color: rgb(203 213 225) !important;
        }
        .dark .jodit-popup .jodit-toolbar-button svg,
        .dark .jodit-popup .jodit-toolbar-content svg {
          fill: rgb(203 213 225) !important;
          stroke: rgb(203 213 225) !important;
        }
        .dark .jodit-popup .jodit-toolbar-button:hover,
        .dark .jodit-popup .jodit-toolbar-content:hover,
        .dark .jodit-popup [class*="jodit-toolbar-button_variant"]:hover,
        .dark .jodit-popup [class*="jodit-toolbar-content_variant"]:hover {
          background: rgb(34 211 238 / 0.12) !important;
          color: rgb(103 232 249) !important;
        }
        .dark .jodit-ui-input__label {
          color: rgb(148 163 184) !important;
        }
        .dark .jodit-ui-input__wrapper {
          border-color: rgb(51 65 85) !important;
          background: rgb(30 41 59) !important;
        }
        .dark .jodit-ui-input__input {
          color: rgb(241 245 249) !important;
        }
      `}</style>
      <JoditEditor
        key={editorKey}
        value={editorSeed}
        config={config as any}
        onChange={emitChange}
        onBlur={emitChange}
      />
    </div>
  );
}
