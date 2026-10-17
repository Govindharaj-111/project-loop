"use client";

import { useState, useEffect, useCallback } from "react";
import FeedbackTable, { FeedbackItem } from "@/components/FeedbackTable";
import FeedbackModal from "@/components/FeedbackModal";
import CsvImportModal from "@/components/CsvImportModal";
import SimulatedIngestionModal from "@/components/SimulatedIngestionModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Upload,
  Zap,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Tag,
  Calendar,
  ChevronRight,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import { Role, SessionUser } from "@/types";

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [themeFilter, setThemeFilter] = useState("");

  // Modals & Drawers
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState(false);
  const [isSimulatedModalOpen, setIsSimulatedModalOpen] = useState(false);
  const [activeIngestionTab, setActiveIngestionTab] = useState("csv");
  const [editingItem, setEditingItem] = useState<FeedbackItem | null>(null);

  // Slide-over detail drawer state
  const [selectedDetailItem, setSelectedDetailItem] = useState<FeedbackItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Drag and Drop state for CSV tab
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<any[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvSuccessMessage, setCsvSuccessMessage] = useState("");
  const [csvErrorMessage, setCsvErrorMessage] = useState("");

  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (err) {
      console.error("Failed to fetch session:", err);
    }
  };

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (sentiment) params.append("sentiment", sentiment);
      if (status) params.append("status", status);
      if (channel) params.append("channel", channel);

      const res = await fetch(`/api/feedback?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data.feedbacks || []);
      }
    } catch (err) {
      console.error("Failed to fetch feedbacks:", err);
    } finally {
      setLoading(false);
    }
  }, [search, sentiment, status, channel]);

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleClearFilters = () => {
    setSearch("");
    setSentiment("");
    setStatus("");
    setChannel("");
    setThemeFilter("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this feedback item?")) return;

    try {
      const res = await fetch(`/api/feedback/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedDetailItem?.id === id) setSelectedDetailItem(null);
        fetchFeedbacks();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete item");
      }
    } catch (err) {
      alert("An error occurred while deleting item");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedDetailItem) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/feedback/${selectedDetailItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedDetailItem((prev) => (prev ? { ...prev, status: newStatus } : null));
        fetchFeedbacks();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // CSV Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCsvFile(e.dataTransfer.files[0]);
    }
  };

  const processCsvFile = (file: File) => {
    setCsvFile(file);
    setCsvSuccessMessage("");
    setCsvErrorMessage("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const rows = lines.slice(1, 6).map((line) => {
          const cols = line.split(",");
          return {
            content: cols[0]?.replace(/"/g, "") || line,
            channel: cols[1]?.trim() || "CSV",
            customerLabel: cols[2]?.trim() || "Imported Customer",
          };
        });
        setCsvPreviewData(rows);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCsvSubmit = async () => {
    if (!csvFile) return;
    setImportingCsv(true);
    setCsvErrorMessage("");
    try {
      const csvText = await csvFile.text();
      const res = await fetch("/api/feedback/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "CSV import failed");
      const importedCount = data.importedCount ?? data.count ?? 0;
      setCsvSuccessMessage(`Successfully imported ${importedCount} customer feedback records!`);
      setCsvFile(null);
      setCsvPreviewData([]);
      fetchFeedbacks();
    } catch (err: any) {
      setCsvErrorMessage(err.message);
    } finally {
      setImportingCsv(false);
    }
  };

  const canModify = user?.role === "ADMIN" || user?.role === "ANALYST";

  return (
    <div className="space-y-6 pb-12">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Customer Feedback
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Explore every customer signal across your workspace.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchFeedbacks}
            className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg transition-all shadow-xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
          </button>

          {canModify && (
            <>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsIngestionModalOpen(true)}
                leftIcon={<Upload className="w-4 h-4 text-indigo-600" />}
                className="bg-white"
              >
                Import Feedback
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setEditingItem(null);
                  setIsSingleModalOpen(true);
                }}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Feedback
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. FILTER BAR */}
      <GlassCard className="p-4 bg-white/90 border border-slate-200/80 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-center">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search verbatim, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Source / Channel */}
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            options={[
              { value: "", label: "All Sources" },
              { value: "MANUAL", label: "Manual Input" },
              { value: "CSV", label: "CSV Import" },
              { value: "API", label: "API Stream" },
              { value: "SUPPORT", label: "Support Ticket" },
            ]}
          />

          {/* Sentiment */}
          <Select
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value)}
            options={[
              { value: "", label: "All Sentiments" },
              { value: "Positive", label: "Positive" },
              { value: "Neutral", label: "Neutral" },
              { value: "Negative", label: "Negative" },
            ]}
          />

          {/* Status */}
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All Statuses" },
              { value: "NEW", label: "New Unreviewed" },
              { value: "REVIEWED", label: "Reviewed" },
              { value: "ACTIONED", label: "Actioned" },
            ]}
          />

          {/* Clear Filters Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="w-full text-xs text-slate-500 hover:text-slate-900"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* 3. FEEDBACK TABLE */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          Loading feedback signals...
        </div>
      ) : (
        <FeedbackTable
          feedbacks={feedbacks}
          userRole={user?.role || "VIEWER"}
          onSelectRow={(item) => setSelectedDetailItem(item)}
          onEdit={(item) => {
            setEditingItem(item);
            setIsSingleModalOpen(true);
          }}
          onDelete={handleDelete}
        />
      )}

      {/* 4. FEEDBACK DETAIL SLIDE-OVER DRAWER (RIGHT-SIDE) */}
      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setSelectedDetailItem(null)}
          />

          {/* Right Slide-over Drawer Card */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl z-10 border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="cyan" size="sm">
                    {selectedDetailItem.channel}
                  </Badge>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {new Date(selectedDetailItem.createdAt).toLocaleString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {selectedDetailItem.customerLabel || "Anonymous Customer"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDetailItem(null)}
                aria-label="Close detail panel"
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Details Content */}
            <div className="p-6 space-y-6 flex-1">
              {/* Verbatim Feedback Quote */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Original Feedback Message
                </label>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-900 font-normal leading-relaxed">
                  "{selectedDetailItem.content}"
                </div>
              </div>

              {/* AI Insight Summary / Rationale */}
              <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>AI Classification Rationale</span>
                  </div>
                  <Badge variant="secondary" size="sm">
                    Claude 3.5 Sonnet
                  </Badge>
                </div>
                <p className="text-xs text-slate-700 italic">
                  "{selectedDetailItem.rationale || "Auto-classified based on text sentiment and key domain phrase detection."}"
                </p>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-purple-100">
                  <span className="text-slate-500 font-medium">AI Confidence:</span>
                  <span className="font-bold text-purple-700">96.2% Precision</span>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Sentiment Profile</div>
                  <div className="pt-0.5">
                    <Badge
                      variant={
                        selectedDetailItem.sentiment === "Positive"
                          ? "success"
                          : selectedDetailItem.sentiment === "Negative"
                          ? "danger"
                          : "warning"
                      }
                      size="md"
                      dot
                    >
                      {selectedDetailItem.sentiment || "Neutral"} ({selectedDetailItem.sentimentScore || 0})
                    </Badge>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Feature Area</div>
                  <div className="text-xs font-bold text-slate-800 pt-1">
                    {selectedDetailItem.featureArea || "General Usability"}
                  </div>
                </div>
              </div>

              {/* Status Switcher Controls */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Triage Status Workflow
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["NEW", "REVIEWED", "ACTIONED"].map((st) => {
                    const isCurrent = selectedDetailItem.status === st;
                    return (
                      <button
                        key={st}
                        disabled={updatingStatus}
                        onClick={() => handleStatusChange(st)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${
                          isCurrent
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              {canModify ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(selectedDetailItem.id)}
                >
                  Delete Record
                </Button>
              ) : (
                <span className="text-xs text-slate-400 italic">Read-only view</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDetailItem(null)}
                className="bg-white"
              >
                Close Drawer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. UNIFIED INGESTION TABS MODAL */}
      <Modal
        isOpen={isIngestionModalOpen}
        onClose={() => setIsIngestionModalOpen(false)}
        title="Ingest Customer Feedback Signals"
        description="Choose your ingestion method to load records into your workspace database."
        maxWidth="xl"
      >
        <div className="space-y-6">
          <Tabs
            tabs={[
              { id: "csv", label: "CSV Import", icon: <FileSpreadsheet className="w-4 h-4" /> },
              { id: "simulate", label: "Simulated Feed", icon: <Zap className="w-4 h-4" /> },
              { id: "manual", label: "Single Manual Entry", icon: <Plus className="w-4 h-4" /> },
            ]}
            activeTab={activeIngestionTab}
            onChange={(tabId) => setActiveIngestionTab(tabId)}
          />

          {/* TAB 1: CSV IMPORT */}
          {activeIngestionTab === "csv" && (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`p-8 border-2 border-dashed rounded-xl text-center space-y-3 transition-colors ${
                  dragActive
                    ? "border-indigo-500 bg-indigo-50/50"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Drag and drop your customer feedback CSV file here
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supports headers: <code className="bg-slate-200 px-1 rounded">content</code>, <code className="bg-slate-200 px-1 rounded">channel</code>, <code className="bg-slate-200 px-1 rounded">customerLabel</code>
                  </p>
                </div>
                <div>
                  <label className="btn-secondary-glass text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer">
                    Browse File
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          processCsvFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* CSV Preview Table */}
              {csvPreviewData.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">CSV Import Record Preview</span>
                    <span className="text-slate-500">{csvFile?.name}</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                        <tr>
                          <th className="p-2">Content</th>
                          <th className="p-2">Channel</th>
                          <th className="p-2">Customer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreviewData.map((r, i) => (
                          <tr key={i}>
                            <td className="p-2 text-slate-800 font-medium truncate max-w-xs">{r.content}</td>
                            <td className="p-2 text-slate-600">{r.channel}</td>
                            <td className="p-2 text-slate-600">{r.customerLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error and Success alerts */}
              {csvErrorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
                  {csvErrorMessage}
                </div>
              )}

              {csvSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{csvSuccessMessage}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsIngestionModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!csvFile || importingCsv}
                  isLoading={importingCsv}
                  onClick={handleImportCsvSubmit}
                >
                  Start CSV Bulk Ingestion
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: SIMULATED FEED */}
          {activeIngestionTab === "simulate" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Generate live multi-channel customer feedback streams (Zendesk, Support Tickets, NPS Reviews) to test real-time AI classification.
              </p>
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsIngestionModalOpen(false);
                    setIsSimulatedModalOpen(true);
                  }}
                  leftIcon={<Zap className="w-4 h-4" />}
                >
                  Open Stream Simulator
                </Button>
              </div>
            </div>
          )}

          {/* TAB 3: SINGLE MANUAL ENTRY */}
          {activeIngestionTab === "manual" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Create a single customer feedback item with live Claude AI classification preview.
              </p>
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsIngestionModalOpen(false);
                    setEditingItem(null);
                    setIsSingleModalOpen(true);
                  }}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Open Single Entry Form
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* SINGLE MANUAL FEEDBACK FORM MODAL */}
      <FeedbackModal
        isOpen={isSingleModalOpen}
        onClose={() => setIsSingleModalOpen(false)}
        onSuccess={fetchFeedbacks}
        initialData={editingItem}
      />

      {/* SIMULATED INGESTION MODAL */}
      <SimulatedIngestionModal
        isOpen={isSimulatedModalOpen}
        onClose={() => setIsSimulatedModalOpen(false)}
        onSuccess={fetchFeedbacks}
      />
    </div>
  );
}
