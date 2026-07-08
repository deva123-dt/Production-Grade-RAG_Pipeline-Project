import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { CONFIG, validateConfig } from "./server/config.js";
import { 
  systemLogs, 
  addLog, 
  ingestDocument, 
  seedPreloadedDatasets, 
  PRELOADED_DATASETS 
} from "./server/ingestion.js";
import { vectorStore } from "./server/vectorstore.js";
import { performSemanticChunking } from "./server/chunking.js";
import { rerankChunks } from "./server/reranker.js";
import { generateRAGAnswer } from "./server/llm.js";

async function startServer() {
  validateConfig();

  const app = express();
  app.use(express.json({ limit: "20mb" })); // Support large document transfers

  // ----------------------------------------------------
  // API ROUTING SECTION (Must sit BEFORE Vite Middleware)
  // ----------------------------------------------------

  // 1. Health & Configuration status Check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      apiKeyConfigured: !!CONFIG.GEMINI_API_KEY,
      vectorStoreSize: vectorStore.size(),
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Clear vector db index
  app.post("/api/clear", (req, res) => {
    try {
      addLog("System", "WARNING", "Wiping database vector indexes and documents by user request.");
      vectorStore.clear();
      res.json({ success: true, message: "Database wiped." });
    } catch (error: any) {
      addLog("System", "ERROR", `Reset failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Retrieve logs
  app.get("/api/logs", (req, res) => {
    res.json({ logs: systemLogs });
  });

  // 4. Retrieve preloaded datasets
  app.get("/api/preloaded", (req, res) => {
    res.json({ datasets: PRELOADED_DATASETS.map(d => ({ filename: d.filename, source: d.source, length: d.text.length, title: d.title })) });
  });

  // 5. Retrieve currently ingested documents
  app.get("/api/documents", (req, res) => {
    try {
      const docs = vectorStore.getIngestedDocuments();
      res.json({ documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. Preview Semantic Chunking (For beautiful chart visualization without saving)
  app.post("/api/chunk-preview", async (req, res) => {
    let { text, filename, thresholdPercentile } = req.body;
    
    // Fallback: If no text is supplied but a filename is, look up from preloaded datasets
    if (!text && filename) {
      const match = PRELOADED_DATASETS.find(d => d.filename === filename);
      if (match) {
        text = match.text;
      }
    }

    if (!text) {
      return res.status(400).json({ error: "No text supplied for chunk preview." });
    }

    try {
      const filenameStr = filename || "scratchpad_preview.txt";
      addLog("ChunkingPreview", "INFO", `Running visualizer chunk preview for: ${filenameStr}`);
      const result = await performSemanticChunking(text, "Instant Preview", filenameStr, {
        thresholdPercentile: thresholdPercentile ? parseInt(thresholdPercentile) : 75,
      });
      res.json(result);
    } catch (error: any) {
      addLog("ChunkingPreview", "ERROR", `Chunk preview failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // 7. Core Document Upload / Ingestion Endpoint
  app.post("/api/upload", async (req, res) => {
    const { filename, source, text, thresholdPercentile } = req.body;
    if (!text || !filename) {
      return res.status(400).json({ error: "Missing document text or filename properties." });
    }

    try {
      const sourceStr = source || "Direct Web Upload";
      const result = await ingestDocument(filename, sourceStr, text, {
        thresholdPercentile: thresholdPercentile ? parseInt(thresholdPercentile) : 75,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 8. Trigger preloaded dataset ingestion
  app.post("/api/ingest-preloaded", async (req, res) => {
    const { filename, thresholdPercentile } = req.body;
    const target = PRELOADED_DATASETS.find(d => d.filename === filename);
    if (!target) {
      return res.status(404).json({ error: `Preloaded dataset filename: ${filename} not found.` });
    }

    try {
      const result = await ingestDocument(target.filename, target.source, target.text, {
        thresholdPercentile: thresholdPercentile ? parseInt(thresholdPercentile) : 75,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 9. Core RAG Query Pipeline Endpoint
  app.post("/api/query", async (req, res) => {
    const { query, topK, filenameFilter, searchMode } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing search query parameter." });
    }

    const startPipeline = Date.now();
    const topKVal = topK ? parseInt(topK) : 4;
    const mode = searchMode || "hybrid";
    addLog("QueryPipeline", "INFO", `Received user query: "${query}" (TopK: ${topKVal}, Mode: ${mode.toUpperCase()})`);

    try {
      // 1. Semantic Similarity / BM25 / Hybrid Retrieval
      addLog("Retrieval", "INFO", `Initiating [${mode.toUpperCase()}] retrieval matching in persistent ChromaDB store...`);
      const rawRetrievals = await vectorStore.query(query, topKVal, filenameFilter ? { filename: filenameFilter } : undefined, mode);
      addLog("Retrieval", "SUCCESS", `Retrieved ${rawRetrievals.length} relevant context chunks matching retrieval logic.`);

      // 2. FlashRank Rerank Pipeline
      addLog("Reranker", "INFO", `Feeding Top-${rawRetrievals.length} candidates into FlashRank cross-encoder...`);
      const reranked = await rerankChunks(query, rawRetrievals);
      addLog("Reranker", "SUCCESS", `FlashRank cross-evaluation completed. Context segments re-weighted and re-sorted.`);

      // 3. Dual-LLM Generation with Fallback routing
      addLog("Generation", "INFO", "Formulating final structured prompt. Activating generative LLM engine...");
      const llmResult = await generateRAGAnswer(query, reranked);
      addLog("Generation", "SUCCESS", `Response successfully processed by: ${llmResult.modelUsed}. Latency: ${llmResult.latencyMs}ms.`);

      const totalLatencyMs = Date.now() - startPipeline;
      addLog("QueryPipeline", "SUCCESS", `Pipeline sequence finalized in ${totalLatencyMs}ms.`);

      res.json({
        answer: llmResult.answer,
        modelUsed: llmResult.modelUsed,
        isFallbackUsed: llmResult.isFallbackUsed,
        generationLatencyMs: llmResult.latencyMs,
        pipelineLatencyMs: totalLatencyMs,
        retrievedSources: rawRetrievals.map(r => ({
          id: r.chunk.id,
          text: r.chunk.text,
          filename: r.chunk.metadata.filename,
          pageNumber: r.chunk.metadata.pageNumber,
          chunkIndex: r.chunk.metadata.chunkIndex,
          similarity: r.similarity,
        })),
        rerankedSources: reranked.map(r => ({
          id: r.chunk.id,
          text: r.chunk.text,
          filename: r.chunk.metadata.filename,
          pageNumber: r.chunk.metadata.pageNumber,
          chunkIndex: r.chunk.metadata.chunkIndex,
          originalSimilarity: r.originalScore,
          rerankedScore: r.rerankedScore,
        })),
      });

    } catch (error: any) {
      addLog("QueryPipeline", "ERROR", `RAG execution crash: ${error.message || error}`);
      res.status(500).json({ error: error.message || "An error occurred during query generation." });
    }
  });

  // ----------------------------------------------------
  // DEV SERVER & STATIC MIDDLEWARE SETUP
  // ----------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Seed default datasets asynchronously so UI loads fast
  seedPreloadedDatasets();

  app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`🚀 RAG Production-Grade Pipeline server listening at http://localhost:${CONFIG.PORT}`);
  });
}

startServer();
