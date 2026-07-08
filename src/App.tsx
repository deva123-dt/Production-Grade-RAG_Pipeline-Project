import React, { useState, useEffect } from "react";
import { DocumentSummary, ChunkingVisualData, QueryResponse } from "./types";
import { DocIngestionTab } from "./components/DocIngestionTab";
import { QueryPipelineTab } from "./components/QueryPipelineTab";
import { VisualizerChart } from "./components/VisualizerChart";
import { LogsTerminal } from "./components/LogsTerminal";
import { 
  Database, 
  HelpCircle, 
  Trash2, 
  Layers, 
  Cpu, 
  BookOpen, 
  ShieldCheck, 
  Activity, 
  RefreshCw,
  HardDrive,
  Network,
  Info
} from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"ingestion" | "query" | "vectorstore" | "logs">("ingestion");
  const [health, setHealth] = useState<{ status: string; apiKeyConfigured: boolean; vectorStoreSize: number } | null>(null);
  const [ingestedDocs, setIngestedDocs] = useState<DocumentSummary[]>([]);
  const [chartData, setChartData] = useState<ChunkingVisualData | null>(null);
  const [chartFile, setChartFile] = useState<string>("");
  const [clearing, setClearing] = useState(false);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) {
      console.error("Health check fetch failed", e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setIngestedDocs(data.documents || []);
      }
    } catch (e) {
      console.error("Failed to load documents", e);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchDocuments();
    
    // Automatically fetch a default preview chart on load if seed finishes
    const timer = setTimeout(() => {
      handleLoadDefaultPreview();
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const handleLoadDefaultPreview = async () => {
    try {
      const res = await fetch("/api/chunk-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "Employee_Handbook_2026.pdf" })
      });
      if (res.ok) {
        const data = await res.json();
        setChartData(data.visualData);
        setChartFile("Employee_Handbook_2026.pdf");
      }
    } catch (e) {
      console.warn("Could not fetch default preview on load yet:", e);
    }
  };

  const handleLoadPreview = async (filename: string) => {
    try {
      const res = await fetch("/api/chunk-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      if (res.ok) {
        const data = await res.json();
        setChartData(data.visualData);
        setChartFile(filename);
        setActiveTab("ingestion");
      }
    } catch (e) {
      console.error("Failed to load chunk preview:", e);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Are you sure you want to clear the vector index? This will remove all ingested documents from local persistent ChromaDB storage.")) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/clear", { method: "POST" });
      if (res.ok) {
        setIngestedDocs([]);
        setChartData(null);
        setChartFile("");
        fetchHealth();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setClearing(false);
    }
  };

  const handleIngested = (chunksCount: number) => {
    fetchHealth();
    fetchDocuments();
  };

  const handlePreviewAvailable = (visualData: ChunkingVisualData, filename: string) => {
    setChartData(visualData);
    setChartFile(filename);
  };

  const handleExecuteQuery = async (query: string, topK: number, filterDoc: string, searchMode: "vector" | "keyword" | "hybrid" = "hybrid"): Promise<QueryResponse> => {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK, filenameFilter: filterDoc, searchMode })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Query pipeline execution failed.");
    }
    // Refresh health to update vector store index sizes
    fetchHealth();
    return data;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans select-none">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-950 block leading-none">RAG Pipeline</span>
              <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mt-1 block">Production Prototype</span>
            </div>
          </div>
          
          {/* Quick status bar */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-500">System:</span>
              <span className="text-slate-800 font-semibold uppercase">{health?.status || "Connecting..."}</span>
            </div>
            <div className="hidden sm:flex items-center space-x-1.5 border-l border-slate-200 pl-4">
              <span className="text-slate-500">Gemini:</span>
              <span className={`font-semibold ${health?.apiKeyConfigured ? "text-indigo-600" : "text-amber-600"}`}>
                {health?.apiKeyConfigured ? "ACTIVE KEY" : "LOCAL FALLBACKS"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 select-text">
        
        {/* Dashboard Title & Quick Stats */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Production-Grade RAG Pipeline Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              An advanced AI retrieval framework utilizing Semantic Chunking distance gradients, local persistent vector storage, FlashRank cross-encoder reranking, and Gemini with automatic LLM failovers.
            </p>
          </div>
          <button
            onClick={handleClearDatabase}
            disabled={clearing || ingestedDocs.length === 0}
            className="self-start md:self-auto bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-all disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            <span>Flush Vector Database</span>
          </button>
        </div>

        {/* Dashboard Metric Nodes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Index Engine</span>
              <span className="text-sm font-bold text-slate-800 block mt-0.5">ChromaDB Local</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-pink-50 rounded-lg text-pink-600">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary LLM</span>
              <span className="text-sm font-bold text-slate-800 block mt-0.5">Gemini 3.5 Flash</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Documents</span>
              <span className="text-sm font-bold text-slate-800 block mt-0.5">{ingestedDocs.length} Files</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vector Chunks Count</span>
              <span className="text-sm font-bold text-slate-800 block mt-0.5">{health?.vectorStoreSize || 0} Nodes</span>
            </div>
          </div>
        </div>

        {/* Dynamic Multi-Step Informational Tip */}
        <div className="p-4 bg-indigo-900 text-indigo-100 rounded-xl shadow-lg border border-indigo-950 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="absolute right-0 top-0 -translate-y-12 translate-x-12 w-48 h-48 bg-indigo-800 rounded-full blur-2xl opacity-45 pointer-events-none"></div>
          <div className="relative z-10 flex items-start space-x-3.5">
            <Info className="w-6 h-6 text-indigo-300 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-white">How this prototype is structured:</h4>
              <p className="text-xs text-indigo-200 mt-1 leading-relaxed max-w-3xl">
                We have preloaded corporate reference PDFs, Markdown and Word FAQs. Complete an <span className="font-semibold text-white underline">Ingest Document</span> sequence to calculate sentence embeddings distance gradients and split nodes. Move to <span className="font-semibold text-white underline">Query Pipeline</span> to execute similarity matches and inspect the original vs FlashRank score comparisons!
              </p>
            </div>
          </div>
          <div className="shrink-0 flex space-x-2">
            <span className="text-[10px] bg-indigo-950/65 text-indigo-300 font-mono py-1 px-2.5 rounded border border-indigo-800/40 font-bold">NODEJS / EXPRESS SERVICE</span>
            <span className="text-[10px] bg-indigo-950/65 text-indigo-300 font-mono py-1 px-2.5 rounded border border-indigo-800/40 font-bold">PYTHON API SEED READY</span>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="border-b border-slate-200 flex space-x-6">
          <button
            onClick={() => setActiveTab("ingestion")}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "ingestion" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            1. Document Ingestion
          </button>
          <button
            onClick={() => setActiveTab("query")}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "query" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            2. Q&A Query Pipeline
          </button>
          <button
            onClick={() => setActiveTab("vectorstore")}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "vectorstore" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            3. ChromaDB Collections
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "logs" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            4. Live Logger Console
          </button>
        </div>

        {/* Main tabs content mapping */}
        <div className="space-y-8">
          {activeTab === "ingestion" && (
            <>
              <DocIngestionTab 
                onIngested={handleIngested} 
                onPreviewAvailable={handlePreviewAvailable}
                ingestedDocs={ingestedDocs}
                onRefreshDocs={fetchDocuments}
              />
              <VisualizerChart data={chartData} filename={chartFile} />
            </>
          )}

          {activeTab === "query" && (
            <QueryPipelineTab 
              ingestedDocs={ingestedDocs} 
              onExecuteQuery={handleExecuteQuery} 
            />
          )}

          {activeTab === "vectorstore" && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Durable ChromaDB Vector Index Summary</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Summary of ingested datasets, metadata counts, and active nodes currently mapped in local storage.</p>
                </div>
                <button 
                  onClick={fetchDocuments}
                  className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  title="Reload active collections"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {ingestedDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Database className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm">ChromaDB store is empty.</p>
                  <p className="text-xs text-slate-400 mt-1">Ingest one of our corporate handbooks or create a custom scratchpad document above to populate index nodes.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ingestedDocs.map((doc) => (
                    <div key={doc.filename} className="border border-slate-150 rounded-xl p-5 hover:border-indigo-200 hover:shadow-md transition-all duration-200 flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[9px] bg-slate-100 text-slate-500 font-mono py-0.5 px-2 rounded-full font-bold uppercase">{doc.source}</span>
                        <h4 className="text-xs font-bold text-slate-800 mt-2">{doc.filename}</h4>
                        <p className="text-[11px] text-indigo-600 font-semibold">{doc.chunksCount} Semantic Chunks stored</p>
                      </div>
                      <button
                        onClick={() => handleLoadPreview(doc.filename)}
                        className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        Chart Metrics
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800">Dynamic Pipeline Event Logger</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Trace execution paths in real-time. This logger outputs details on document parsing, semantic sentence grading, vector indexing, similarity retrieving, cross-encoder scoring, and LLM retry fallback events.
                </p>
              </div>
              <LogsTerminal />
            </div>
          )}
        </div>

      </main>

      {/* Persistent logging bar or footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-slate-400 text-xs">
        <p className="font-mono">RAG Portfolio Prototype Built with React, Vite, Express & Google GenAI SDK</p>
        <p className="text-[10px] text-slate-400 mt-1">All rights reserved. Secure server API proxies hide credentials safely.</p>
      </footer>

    </div>
  );
}
