import React, { useState } from "react";
import { DocumentSummary, QueryResponse } from "../types";
import { Search, Sliders, FileText, CheckCircle, ArrowRight, Loader2, Sparkles, Zap, ShieldAlert, BadgeInfo } from "lucide-react";

interface QueryPipelineTabProps {
  ingestedDocs: DocumentSummary[];
  onExecuteQuery: (query: string, topK: number, filterDoc: string, searchMode: "vector" | "keyword" | "hybrid") => Promise<QueryResponse>;
}

export const QueryPipelineTab: React.FC<QueryPipelineTabProps> = ({ ingestedDocs, onExecuteQuery }) => {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(4);
  const [filterDoc, setFilterDoc] = useState("");
  const [searchMode, setSearchMode] = useState<"vector" | "keyword" | "hybrid">("hybrid");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await onExecuteQuery(query, topK, filterDoc, searchMode);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Query pipeline execution failed.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to find ranks comparison
  const getRankShift = (chunkId: string, rerankedIdx: number) => {
    if (!result) return { shift: 0, text: "" };
    const originalIdx = result.retrievedSources.findIndex(s => s.id === chunkId);
    if (originalIdx === -1) return { shift: 0, text: "" };

    const shift = originalIdx - rerankedIdx; // positive is positive shift up
    if (shift > 0) {
      return { shift, text: `↑ +${shift} positions`, color: "text-emerald-600 font-bold" };
    } else if (shift < 0) {
      return { shift, text: `↓ ${shift} positions`, color: "text-rose-500 font-bold" };
    }
    return { shift, text: "No Change", color: "text-slate-400" };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Sidebar Settings Panel */}
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Sliders className="w-5 h-5 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-800">Retrieval Parameters</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Customize vector search operations. Set Top-K candidates retrieved from ChromaDB before sorting with FlashRank.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Top-K Retrieval Nodes: <span className="text-indigo-600 font-bold font-mono">{topK}</span>
              </label>
              <input 
                type="range"
                min="1"
                max="10"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1 mb-3">
                <span>Top-1</span>
                <span>Top-4 (Standard)</span>
                <span>Top-10</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Retrieval Strategy (Search Mode)
              </label>
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as any)}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="hybrid">🌐 Hybrid (Vector + BM25 Sparse + RRF)</option>
                <option value="vector">🧬 Semantic Vector (Dense Cosine)</option>
                <option value="keyword">🔍 Keyword Match (Okapi BM25)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Metadata Scope Filter
              </label>
              <select
                value={filterDoc}
                onChange={(e) => setFilterDoc(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Query entire Database Collection (All)</option>
                {ingestedDocs.map(doc => (
                  <option key={doc.filename} value={doc.filename}>
                    Scope: {doc.filename}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">RAG Pipeline Sequence</h4>
                <ol className="text-[10px] text-slate-500 space-y-1 font-mono">
                  <li>1. User Query → Embedding Vector</li>
                  <li>2. Cosine Similarity search in ChromaDB</li>
                  <li>3. FlashRank Cross-Encoder reranking</li>
                  <li>4. Cited Prompt assembly & LLM query</li>
                </ol>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Main Chat / Generation Window */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Core Query Input */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="flex space-x-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input 
                type="text"
                required
                disabled={ingestedDocs.length === 0}
                placeholder={ingestedDocs.length === 0 ? "⚠️ Please ingest a document first on the Ingestion tab." : "Search custom knowledge base (e.g. PTO allowance, server scaling...)"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim() || ingestedDocs.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl flex items-center space-x-1.5 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span>Query Pipeline</span>
                </>
              )}
            </button>
          </form>
          {ingestedDocs.length === 0 && (
            <p className="text-[10px] text-amber-600 font-medium mt-2 flex items-center space-x-1">
              <BadgeInfo className="w-3.5 h-3.5" />
              <span>ChromaDB index is empty. Complete an Ingestion workflow first to execute queries.</span>
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs shadow-sm">
            {error}
          </div>
        )}

        {/* Results view */}
        {result && (
          <div className="space-y-6">
            
            {/* RAG Answer Output */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-indigo-500 fill-indigo-100" />
                  <h3 className="text-sm font-bold text-slate-800">Cited RAG Answer</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0 text-[10px]">
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-mono font-semibold">
                    Model: {result.modelUsed}
                  </span>
                  {result.isFallbackUsed && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                      <ShieldAlert className="w-3 h-3" />
                      <span>FALLOVER DEPLOYED</span>
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                    LLM Latency: {result.generationLatencyMs}ms
                  </span>
                </div>
              </div>

              {/* Text answer block */}
              <div className="text-xs text-slate-700 leading-relaxed space-y-4 whitespace-pre-line select-text">
                {result.answer}
              </div>
            </div>

            {/* FlashRank Reranker Comparative Trace */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm overflow-hidden">
              <div className="mb-4">
                <h4 className="text-sm font-bold text-slate-800">Reranker Precision Audit Trace</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualizing how FlashRank's cross-encoder evaluates contextual relevancy to re-sort standard ChromaDB vector similarity scores.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                      <th className="px-4 py-3">Final Rank</th>
                      <th className="px-4 py-3">Source & Location</th>
                      <th className="px-4 py-3 text-center">Chroma Vector Match</th>
                      <th className="px-4 py-3 text-center">FlashRank Score</th>
                      <th className="px-4 py-3 text-center">Rank Shift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {result.rerankedSources.map((item, idx) => {
                      const shiftData = getRankShift(item.id, idx);
                      return (
                        <tr key={item.id} className="hover:bg-slate-55/40 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-700">
                            #{idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={item.filename}>
                              {item.filename}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Page {item.pageNumber} • Chunk {item.chunkIndex}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded font-mono font-semibold">
                              {item.originalSimilarity.toFixed(4)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded font-mono font-bold">
                              {item.rerankedScore.toFixed(4)}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-center font-mono text-[10px] ${shiftData.color}`}>
                            {shiftData.text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Chunks inspector accordions */}
              <div className="mt-5 space-y-3">
                <h5 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Inspecting Reranked Source Chunks</h5>
                {result.rerankedSources.map((item, idx) => (
                  <div key={item.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-2">
                      <span>CHUNK #{idx + 1} ({item.filename}, Page {item.pageNumber})</span>
                      <span className="text-indigo-600 font-semibold">Rerank Score: {item.rerankedScore.toFixed(3)}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-mono select-text bg-white p-2.5 rounded border border-slate-100">
                      "{item.text}"
                    </p>
                  </div>
                ))}
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
};
