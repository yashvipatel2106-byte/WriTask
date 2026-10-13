"use client";

import { useRef, useState, DragEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  Download,
  Loader2,
} from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<ImportResult>;
};

type ImportResult = {
  message: string;
  totalRows: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
};

const allowedExtensions = ["xlsx", "xls", "csv"];

export default function ImportTasksDialog({
  open,
  onClose,
  onImport,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setFile(null);
    setDragging(false);
    setUploading(false);
    setError("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
    onClose();
  };

  const validateFile = (selected: File) => {
    const extension =
      selected.name.split(".").pop()?.toLowerCase() || "";

    if (!allowedExtensions.includes(extension)) {
      setError("Only .xlsx, .xls and .csv files are allowed.");
      return false;
    }

    setError("");
    return true;
  };

  const handleFile = (selected: File) => {
    if (!validateFile(selected)) return;
    setResult(null);
    setFile(selected);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);

    if (!e.dataTransfer.files.length) return;

    handleFile(e.dataTransfer.files[0]);
  };

  const importFile = async () => {
    if (!file) return;

    try {
      setUploading(true);

      const importResult = await onImport(file);
      setResult(importResult);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/task-import-example.csv";
    link.download = "task-import-example.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <ModalShell
      onClose={resetAndClose}
      maxWidth="2xl"
      className="overflow-hidden"
    >
      <div className="p-6">

        <ModalHeader
          title="Import Tasks"
          subtitle="Upload an Excel file to create tasks in bulk."
          onClose={resetAndClose}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-6 border-2 border-dashed rounded-2xl p-10 transition cursor-pointer
          ${
            dragging
              ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10"
              : "border-slate-300 dark:border-slate-700"
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center text-center">

            <div className="w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-500/10 flex items-center justify-center">
              <Upload
                className="text-cyan-700 dark:text-cyan-400"
                size={30}
              />
            </div>

            <h3 className="mt-5 font-semibold text-lg">
              Drag & Drop Excel File
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              or click anywhere to browse
            </p>

            <p className="mt-5 text-xs text-slate-400">
              Accepted formats:
              <span className="font-medium">
                {" "}
                .xlsx, .xls, .csv
              </span>
            </p>

            
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {result.message}
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {result.totalRows} rows processed · {result.created} created · {result.failed} skipped
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto text-red-600 dark:text-red-400">
                {result.errors.map((item, index) => (
                  <li key={`${item.row}-${index}`}>
                    Row {item.row}: {item.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {file && (
          <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex justify-between items-center">

            <div className="flex items-center gap-3">

              <FileSpreadsheet
                className="text-emerald-600"
                size={28}
              />

              <div>
                <p className="font-medium">
                  {file.name}
                </p>

                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            <button
              onClick={() => setFile(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-cyan-700 hover:text-cyan-800 text-sm"
          >
            <Download size={16} />
            Download Sample Template
          </button>

          <div className="flex gap-3">

            <button
              onClick={resetAndClose}
              className="px-5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              disabled={!file || uploading}
              onClick={importFile}
              className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-2"
            >
              {uploading && (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              )}

              {uploading
                ? "Uploading..."
                : "Import Tasks"}
            </button>

          </div>
        </div>

      </div>
    </ModalShell>
  );
}
