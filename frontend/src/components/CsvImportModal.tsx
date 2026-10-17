"use client";

import { useState } from "react";
import { X, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
}: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
      setResult(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a CSV file to upload");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const csvText = await file.text();

      const res = await fetch("/api/feedback/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to import CSV");
      }

      setResult({
        ...data,
        importedCount: data.importedCount ?? data.count ?? 0,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-lg">
            <Upload className="w-5 h-5 text-indigo-600" />
            <span>Bulk Import CSV Feedback</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl space-y-2 text-xs">
              <div className="font-bold flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>CSV Ingestion Complete</span>
              </div>
              <p>Successfully imported <strong>{result.importedCount}</strong> feedback records into active workspace.</p>
              {result.failedCount > 0 && (
                <p className="text-rose-700">Failed / Skipped rows: <strong>{result.failedCount}</strong></p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setResult(null); setFile(null); onClose(); }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-2">
              <FileText className="w-8 h-8 text-indigo-600 mx-auto" />
              <div className="text-xs text-slate-600 font-medium">
                Upload a CSV file containing columns: <br />
                <code className="text-indigo-600 font-mono">content, channel, customer_label, created_at</code>
              </div>

              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer pt-2"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 btn-secondary-glass text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="px-5 py-2.5 btn-primary text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                {loading ? "Importing..." : "Upload & Process CSV"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
