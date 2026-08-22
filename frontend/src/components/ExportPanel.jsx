import React, { useState } from "react";
import { api } from "@/lib/api";

/**
 * ExportPanel — "Export for Admin Review" card.
 * Adapted from Somesh0206/Export-Feature with full token auth, date-range filtering, and download handlers.
 */
export default function ExportPanel({
  title = "Export Audit & Usage Reports",
  subtitle = "Download full commuter activity logs, feature utilization metrics, and daily usage audits as CSV spreadsheets or print-ready PDFs.",
  defaultDays = 30,
  onExportSuccess = () => {}
}) {
  const [days, setDays] = useState(defaultDays);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleDownload = async (type) => {
    const isCsv = type === "csv";
    if (isCsv) setDownloadingCsv(true);
    else setDownloadingPdf(true);
    setStatusMessage(null);

    try {
      const endpoint = isCsv
        ? `/exports/daily-usage.csv?days=${days}`
        : `/exports/daily-usage.pdf?days=${days}`;

      const res = await api.get(endpoint, {
        responseType: "blob"
      });

      // Create download link from blob
      const blob = new Blob([res.data], {
        type: isCsv ? "text/csv;charset=utf-8;" : "application/pdf"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const todayStr = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `mova-audit-report-${days}days-${todayStr}.${isCsv ? "csv" : "pdf"}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setStatusMessage({
        type: "success",
        text: `Successfully downloaded ${isCsv ? "CSV Spreadsheet" : "PDF Audit Report"} (Last ${days} days)!`
      });
      onExportSuccess(type);
    } catch (err) {
      console.error("Export download failed:", err);
      setStatusMessage({
        type: "error",
        text: `Export failed: ${err.response?.data?.detail || "Only authorized admins can download reports."}`
      });
    } finally {
      if (isCsv) setDownloadingCsv(false);
      else setDownloadingPdf(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/70 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
      {/* Decorative gradient blur */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-44 h-44 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📥</span>
              <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                Admin Clearance Required
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">{subtitle}</p>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
            <span className="text-xs font-medium text-slate-400 px-2">Scope:</span>
            {[
              { label: "Today", value: 1 },
              { label: "7 Days", value: 7 },
              { label: "30 Days", value: 30 },
              { label: "All Time", value: 365 }
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                  days === opt.value
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40"
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleDownload("csv")}
            disabled={downloadingCsv || downloadingPdf}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
          >
            {downloadingCsv ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Generating CSV...</span>
              </>
            ) : (
              <>
                <span>📊</span>
                <span>Download CSV Dataset</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleDownload("pdf")}
            disabled={downloadingCsv || downloadingPdf}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
          >
            {downloadingPdf ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Rendering PDF...</span>
              </>
            ) : (
              <>
                <span>📑</span>
                <span>Download PDF Audit Report</span>
              </>
            )}
          </button>

          <div className="ml-auto text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Real-time DB Audit Logging Active</span>
          </div>
        </div>

        {/* Feedback alert */}
        {statusMessage && (
          <div
            className={`mt-4 text-xs sm:text-sm px-4 py-2.5 rounded-xl border flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : "bg-red-950/60 border-red-500/40 text-red-300"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white font-bold text-base ml-2"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
