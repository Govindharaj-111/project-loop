"use client";

import { useState } from "react";
import { X, Zap, CheckCircle2 } from "lucide-react";

interface SimulatedIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SimulatedIngestionModal({
  isOpen,
  onClose,
  onSuccess,
}: SimulatedIngestionModalProps) {
  const [channel, setChannel] = useState("Support Ticket");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/feedback/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, count: Number(count) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger simulated ingestion");
      }

      setResult(data);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-lg">
            <Zap className="w-5 h-5 text-amber-500" />
            <span>Simulate Channel Ingestion</span>
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
                <span>Simulated Ingestion Triggered</span>
              </div>
              <p>Generated <strong>{result.count ?? result.importedCount ?? 0}</strong> realistic feedback records for <strong>{result.channel || "all channels"}</strong>.</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setResult(null); onClose(); }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Ingestion Channel Feed</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="Support Ticket">Support Ticket Feed</option>
                <option value="App Review">App Store Review Stream</option>
                <option value="NPS Survey">NPS Survey Feedback</option>
                <option value="Sales Call">Sales Call Notes</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Record Volume</label>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                disabled={loading}
                className="px-5 py-2.5 btn-primary text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Trigger Simulated Ingestion"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
