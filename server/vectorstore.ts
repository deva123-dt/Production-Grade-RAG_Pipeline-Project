import fs from "fs";
import path from "path";
import { generateEmbedding } from "./embeddings.js";
import { ChunkResult, cosineSimilarity } from "./chunking.js";

export interface VectorStoreItem {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkResult["metadata"];
}

const STORAGE_DIR = path.join(process.cwd(), "chroma_db");
const STORAGE_FILE = path.join(STORAGE_DIR, "local_store.json");

/**
 * Standard text tokenization utility. Converts to lower case, removes punctuation,
 * and splits by whitespace.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export class LocalVectorStore {
  private items: Map<string, VectorStoreItem> = new Map();

  constructor() {
    this.ensureStorageDir();
    this.loadFromDisk();
  }

  private ensureStorageDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
  }

  /**
   * Persists vectors and chunk metadata to a local JSON file.
   * This guarantees durable cloud-like local persistence between container restarts.
   */
  private saveToDisk() {
    try {
      this.ensureStorageDir();
      const serializable = Array.from(this.items.entries());
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(serializable, null, 2), "utf8");
    } catch (error) {
      console.error("Failed to persist vector store to disk:", error);
    }
  }

  /**
   * Loads persisted vectors and chunks back into memory.
   */
  private loadFromDisk() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const fileContent = fs.readFileSync(STORAGE_FILE, "utf8");
        const parsed = JSON.parse(fileContent) as [string, VectorStoreItem][];
        this.items = new Map(parsed);
        console.log(`Successfully loaded ${this.items.size} vector chunks from local disk vector store.`);
      }
    } catch (error) {
      console.error("Failed to load vector store from disk:", error);
      this.items = new Map();
    }
  }

  /**
   * Adds semantic chunks and their generated embeddings to the store.
   * Handles duplicate documents elegantly by overwriting old chunk mappings.
   */
  public addItems(chunks: ChunkResult[], embeddings: number[][]) {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      const item: VectorStoreItem = {
        id: chunk.id,
        text: chunk.text,
        embedding,
        metadata: chunk.metadata,
      };

      this.items.set(chunk.id, item);
    }
    this.saveToDisk();
  }

  /**
   * Queries the database using vector, keyword, or hybrid search.
   * Supports metadata filtering and configurable top-k.
   */
  public async query(
    queryText: string,
    topK: number = 4,
    filter?: { filename?: string },
    searchMode: "vector" | "keyword" | "hybrid" = "hybrid"
  ): Promise<{ chunk: ChunkResult; similarity: number }[]> {
    if (searchMode === "keyword") {
      return this.bm25Search(queryText, topK, filter);
    } else if (searchMode === "hybrid") {
      return this.hybridQuery(queryText, topK, filter);
    }

    // Default: Vector Search (Cosine Similarity)
    const queryEmbedding = await generateEmbedding(queryText);
    const results: { chunk: ChunkResult; similarity: number }[] = [];

    for (const [_, item] of this.items.entries()) {
      // Apply metadata filter if specified
      if (filter?.filename && item.metadata.filename !== filter.filename) {
        continue;
      }

      const sim = cosineSimilarity(queryEmbedding, item.embedding);
      
      // Map back to a clean ChunkResult structure
      const chunk: ChunkResult = {
        id: item.id,
        text: item.text,
        startIndex: 0,
        endIndex: 0,
        sentencesCount: 0,
        metadata: item.metadata,
      };

      results.push({ chunk, similarity: sim });
    }

    // Sort by cosine similarity in descending order and return top K
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Performs Okapi BM25-based keyword search on the stored chunks.
   */
  public bm25Search(
    queryText: string,
    topK: number = 4,
    filter?: { filename?: string }
  ): { chunk: ChunkResult; similarity: number }[] {
    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0 || this.items.size === 0) {
      return [];
    }

    // Filter relevant items
    const filteredItems = Array.from(this.items.values()).filter((item) => {
      if (filter?.filename && item.metadata.filename !== filter.filename) {
        return false;
      }
      return true;
    });

    if (filteredItems.length === 0) {
      return [];
    }

    const N = filteredItems.length;
    
    // Tokenize all filtered chunks and compute average document length
    const chunkTokens = filteredItems.map((item) => tokenize(item.text));
    const docLengths = chunkTokens.map((tokens) => tokens.length);
    const totalDocLength = docLengths.reduce((sum, len) => sum + len, 0);
    const avgdl = totalDocLength / N || 1;

    // Calculate document frequencies (DF) for each query token
    const dfMap = new Map<string, number>();
    for (const token of queryTokens) {
      let count = 0;
      for (const tokens of chunkTokens) {
        if (tokens.includes(token)) {
          count++;
        }
      }
      dfMap.set(token, count);
    }

    // Calculate IDF for each query token
    const idfMap = new Map<string, number>();
    for (const token of queryTokens) {
      const df = dfMap.get(token) || 0;
      // BM25 IDF with smoothing
      const idf = Math.max(0.0001, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
      idfMap.set(token, idf);
    }

    // BM25 parameter constants
    const k1 = 1.2;
    const b = 0.75;

    // Score all filtered documents
    const scoredResults: { chunk: ChunkResult; similarity: number }[] = [];

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const tokens = chunkTokens[i];
      const docLen = docLengths[i];

      // Calculate term frequency map for this document
      const tfMap = new Map<string, number>();
      for (const t of tokens) {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
      }

      let score = 0;
      for (const qToken of queryTokens) {
        const tf = tfMap.get(qToken) || 0;
        if (tf > 0) {
          const idf = idfMap.get(qToken) || 0;
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (docLen / avgdl));
          score += idf * (numerator / denominator);
        }
      }

      // Sigmoid normalization to scale score cleanly into [0, 1] range
      const normalizedScore = score > 0 ? score / (score + 1) : 0;

      const chunk: ChunkResult = {
        id: item.id,
        text: item.text,
        startIndex: 0,
        endIndex: 0,
        sentencesCount: 0,
        metadata: item.metadata,
      };

      scoredResults.push({ chunk, similarity: normalizedScore });
    }

    // Sort by score descending
    return scoredResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Performs Reciprocal Rank Fusion (RRF) to merge Vector Search and BM25 Keyword Search.
   */
  public async hybridQuery(
    queryText: string,
    topK: number = 4,
    filter?: { filename?: string }
  ): Promise<{ chunk: ChunkResult; similarity: number }[]> {
    // 1. Get Top-20 candidate nodes via Cosine Similarity Vector Search
    const vectorResults = await this.query(queryText, 20, filter, "vector");

    // 2. Get Top-20 candidate nodes via Okapi BM25 Keyword Search
    const keywordResults = this.bm25Search(queryText, 20, filter);

    // 3. Reciprocal Rank Fusion (RRF) constants
    const k = 60; // Standard RRF smoothing constant

    // Map to keep track of combined candidate states
    const rrfMap = new Map<string, { 
      chunk: ChunkResult; 
      vectorRank: number; 
      keywordRank: number; 
      vectorSim: number;
      keywordSim: number;
    }>();

    // Populate vector ranks
    vectorResults.forEach((res, index) => {
      rrfMap.set(res.chunk.id, {
        chunk: res.chunk,
        vectorRank: index + 1,
        keywordRank: Infinity,
        vectorSim: res.similarity,
        keywordSim: 0,
      });
    });

    // Populate keyword ranks
    keywordResults.forEach((res, index) => {
      const existing = rrfMap.get(res.chunk.id);
      if (existing) {
        existing.keywordRank = index + 1;
        existing.keywordSim = res.similarity;
      } else {
        rrfMap.set(res.chunk.id, {
          chunk: res.chunk,
          vectorRank: Infinity,
          keywordRank: index + 1,
          vectorSim: 0,
          keywordSim: res.similarity,
        });
      }
    });

    // Compute final Reciprocal Rank Fusion score for each chunk
    const rrfResults: { chunk: ChunkResult; similarity: number; rrfScore: number }[] = [];

    for (const [_, val] of rrfMap.entries()) {
      const rrfScoreVec = val.vectorRank === Infinity ? 0 : 1 / (k + val.vectorRank);
      const rrfScoreKw = val.keywordRank === Infinity ? 0 : 1 / (k + val.keywordRank);
      const rrfScore = rrfScoreVec + rrfScoreKw;

      // Normalize RRF score to range [0, 1] for compat with chart & UI
      // Perfect match ranking #1 in both is (1/61 + 1/61) = 0.03278
      const scaledSimilarity = Math.min(0.99, rrfScore * 30.5);

      rrfResults.push({
        chunk: val.chunk,
        similarity: scaledSimilarity,
        rrfScore,
      });
    }

    // Sort by RRF score descending and return Top K
    return rrfResults
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK)
      .map((item) => ({
        chunk: item.chunk,
        similarity: item.similarity,
      }));
  }

  /**
   * Clears the entire vector store (both in-memory and on disk).
   */
  public clear() {
    this.items.clear();
    this.saveToDisk();
    console.log("Vector store successfully cleared.");
  }

  /**
   * Gets list of distinct ingested documents
   */
  public getIngestedDocuments(): { filename: string; source: string; chunksCount: number }[] {
    const docMap = new Map<string, { filename: string; source: string; count: number }>();
    
    for (const item of this.items.values()) {
      const key = item.metadata.filename;
      const existing = docMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        docMap.set(key, {
          filename: item.metadata.filename,
          source: item.metadata.source,
          count: 1,
        });
      }
    }

    return Array.from(docMap.values()).map((doc) => ({
      filename: doc.filename,
      source: doc.source,
      chunksCount: doc.count,
    }));
  }

  /**
   * Gets total number of vector chunks stored.
   */
  public size(): number {
    return this.items.size;
  }
}

// Export singleton instance of Vector Store
export const vectorStore = new LocalVectorStore();
