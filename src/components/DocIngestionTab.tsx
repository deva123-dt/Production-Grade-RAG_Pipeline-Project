import React, { useState, useEffect } from "react";
import { PreloadedDataset, DocumentSummary, ChunkingVisualData } from "../types";
import { Upload, Database, CheckCircle, FileText, Sparkles, Loader2, Play } from "lucide-react";

interface DocIngestionTabProps {
  onIngested: (chunksCount: number) => void;
  onPreviewAvailable: (visualData: ChunkingVisualData, filename: string) => void;
  ingestedDocs: DocumentSummary[];
  onRefreshDocs: () => void;
}

export const DocIngestionTab: React.FC<DocIngestionTabProps> = ({
  onIngested,
  onPreviewAvailable,
  ingestedDocs,
  onRefreshDocs,
}) => {
  const [preloaded, setPreloaded] = useState<PreloadedDataset[]>([]);
  const [percentile, setPercentile] = useState<number>(75);
  
  // Custom text upload states
  const [customFile, setCustomFile] = useState<string>("");
  const [customText, setCustomText] = useState<string>("");
  const [customSource, setCustomSource] = useState<string>("");
  
  // Loading states
  const [loadingDataset, setLoadingDataset] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch preloaded options on load
  useEffect(() => {
    fetch("/api/preloaded")
      .then(res => res.ok ? res.json() : { datasets: [] })
      .then(data => setPreloaded(data.datasets || []))
      .catch(e => console.error("Failed to load preloaded info", e));
  }, []);

  const handleIngestPreloaded = async (filename: string) => {
    setLoadingDataset(filename);
    setErrorMessage(null);
    try {
      // 1. Ingest document
      const res = await fetch("/api/ingest-preloaded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, thresholdPercentile: percentile })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingestion request failed.");

      onIngested(data.chunksCount);

      // 2. Load chunking preview data for instant visualization
      const targetDataset = preloaded.find(p => p.filename === filename);
      if (targetDataset) {
        // We'll fetch the full text (simulated since we have PRELOADED_DATASETS in the backend)
        // Wait, the backend `/api/chunk-preview` can generate the preview details directly.
        // Let's trigger a chunk-preview call on the backend for the preloaded document text!
        // The backend knows preloaded datasets. But how to get the text? We can fetch a preview using target dataset properties.
        // Wait, the backend handles preloaded dataset ingestion already. To show the chunk chart instantly,
        // we can fetch the preview. Let's send a preview request. But we need the text. To do that, the backend
        // can provide a preview. Let's make sure `/api/chunk-preview` works with a filename or let's call it.
        // Actually, let's create a chunk preview endpoint. Oh! I already created `POST /api/chunk-preview` that takes `text` in req.body.
        // Wait, we can modify the backend or we can fetch a preview using a simple fetch if we had the text,
        // OR we can make `POST /api/chunk-preview` support fetching by preloaded filename directly!
        // That is an excellent design detail. Let's double check if we can make a query. Yes! Let's check how we handled it.
        // Let's check /server.ts:
        // `app.post("/api/chunk-preview", async (req, res) => { const { text, filename, thresholdPercentile } = req.body; ...`
        // Wait, we can fetch the dataset's text in the frontend if we want, or we can look up preloaded text.
        // Actually, to keep it simple and ultra-clean, let's let the backend `/api/chunk-preview` also accept a `preloadedFilename`!
        // Let's modify `/api/chunk-preview` inside `server.ts` using `edit_file` to support lookup of preloaded text if `text` is missing!
        // Oh wait, first let's see how the API call looks.
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred during ingestion.");
    } finally {
      setLoadingDataset(null);
      onRefreshDocs();
    }
  };

  const handleCustomIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFile || !customText) {
      setErrorMessage("Please supply a filename and text body.");
      return;
    }
    setUploading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: customFile.endsWith(".txt") || customFile.endsWith(".md") ? customFile : `${customFile}.txt`,
          source: customSource || "User Text Upload",
          text: customText,
          thresholdPercentile: percentile
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Custom ingestion failed.");

      onIngested(data.chunks_ingested);

      // Fetch preview right away for custom text to render the SVG line graph
      const previewRes = await fetch("/api/chunk-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: customText,
          filename: customFile,
          thresholdPercentile: percentile
        })
      });
      if (previewRes.ok) {
        const previewData = await previewRes.json();
        onPreviewAvailable(previewData.visualData, customFile);
      }

      setCustomFile("");
      setCustomText("");
      setCustomSource("");
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred.");
    } finally {
      setUploading(false);
      onRefreshDocs();
    }
  };

  // Helper to load preview chart of currently ingested file
  const handleLoadPreview = async (filename: string) => {
    // We can fetch preview by sending a preview request.
    // Wait, let's trigger it so user can visual-split files.
    // If it's preloaded, let's trigger a preview from the backend.
    setLoadingDataset(filename);
    try {
      // Fetch preview by matching filename
      const res = await fetch("/api/chunk-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          text: "", // We can let backend find it
          thresholdPercentile: percentile
        })
      });
      if (res.ok) {
        const data = await res.json();
        onPreviewAvailable(data.visualData, filename);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDataset(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Parameters & Preloaded Datasets Ingestion */}
      <div className="lg:col-span-2 space-y-6">
        {/* Semantic Split Config */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-2.5 mb-3">
            <Database className="w-5 h-5 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-800">1. Semantic Split Sensitivity</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Configure the percentile boundary for sentence splits. A higher percentile (e.g. 80-90%) yields longer, highly contextual chunks, while a lower percentile (e.g. 50-60%) yields shorter, highly granular chunks.
          </p>
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-medium text-slate-700 mb-2">
              <span>Split Threshold Percentile</span>
              <span className="text-indigo-600 font-bold">{percentile}th Percentile</span>
            </div>
            <input 
              type="range" 
              min="30" 
              max="95" 
              value={percentile} 
              onChange={(e) => setPercentile(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
              <span>30% (Granular / Frequent Splits)</span>
              <span>75% (Standard)</span>
              <span>95% (Large / Infrequent Splits)</span>
            </div>
          </div>
        </div>

        {/* Preloaded Knowledge Bases */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800">2. Preloaded Corporate Documents</h3>
            </div>
            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-mono font-semibold">ZERO-CONFIG</span>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Ingest structured reference templates instantly. These are complete multi-paragraph documents representing corporate human resource handbook rules, load balancers network configurations, and standard customer cancelation procedures.
          </p>
          
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs mb-4">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {preloaded.map((item) => {
              const isIngested = ingestedDocs.some(d => d.filename === item.filename);
              const isLoading = loadingDataset === item.filename;

              return (
                <div 
                  key={item.filename}
                  className={`border rounded-xl p-4 flex flex-col justify-between transition-all duration-200 ${
                    isIngested 
                      ? "border-emerald-200 bg-emerald-50/20" 
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <FileText className={`w-8 h-8 ${isIngested ? "text-emerald-500" : "text-slate-400"}`} />
                      {isIngested && (
                        <span className="flex items-center space-x-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>INGESTED</span>
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-800 mt-2.5 line-clamp-1">{item.title}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{item.filename}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[10px] text-slate-500">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{(item.length / 1000).toFixed(1)}K Chars</span>
                      <span className="text-slate-400">•</span>
                      <span>{item.source}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100/60 flex space-x-2">
                    <button
                      onClick={() => handleIngestPreloaded(item.filename)}
                      disabled={isLoading}
                      className={`flex-1 flex items-center justify-center space-x-1 text-[11px] font-medium py-1.5 px-3 rounded-lg transition-all ${
                        isIngested
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      } disabled:opacity-50`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Ingesting...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-white" />
                          <span>{isIngested ? "Re-Ingest" : "Ingest Document"}</span>
                        </>
                      )}
                    </button>
                    {isIngested && (
                      <button
                        onClick={() => handleLoadPreview(item.filename)}
                        className="border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] py-1.5 px-2.5 rounded-lg transition-all"
                        title="Visualize Sentence Distance Chart"
                      >
                        Chart
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Manual Document Creator / Scratchpad */}
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 mb-3">
              <Upload className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800">3. Ingest Custom Knowledge Base</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Create a document manually. Type or paste guidelines, policies, or complex FAQs to run and visualize semantic splits immediately.
            </p>

            <form onSubmit={handleCustomIngest} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Document Filename</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g., API_Specifications.txt"
                  value={customFile}
                  onChange={(e) => setCustomFile(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Source / Department</label>
                <input 
                  type="text"
                  placeholder="e.g., DevOps Wiki"
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Document Content Body</label>
                <textarea 
                  required
                  rows={5}
                  placeholder="Paste multi-sentence guidelines here to test embedding distances..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={uploading || !customFile || !customText}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing & Indexing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload & Split Semantically</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

    </div>
  );
};
