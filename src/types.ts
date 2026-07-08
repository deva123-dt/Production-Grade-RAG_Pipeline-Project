export interface DocumentSummary {
  filename: string;
  source: string;
  chunksCount: number;
}

export interface ChunkResult {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  sentencesCount: number;
  metadata: {
    source: string;
    filename: string;
    pageNumber: number;
    chunkIndex: number;
  };
}

export interface ChunkingVisualData {
  sentences: string[];
  distances: number[];
  threshold: number;
  splits: number[];
}

export interface LogItem {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  module: string;
  message: string;
}

export interface PreloadedDataset {
  filename: string;
  source: string;
  length: number;
  title: string;
}

export interface RetrievedSource {
  id: string;
  text: string;
  filename: string;
  pageNumber: number;
  chunkIndex: number;
  similarity: number;
}

export interface RerankedSource {
  id: string;
  text: string;
  filename: string;
  pageNumber: number;
  chunkIndex: number;
  originalSimilarity: number;
  rerankedScore: number;
}

export interface QueryResponse {
  answer: string;
  modelUsed: string;
  isFallbackUsed: boolean;
  generationLatencyMs: number;
  pipelineLatencyMs: number;
  retrievedSources: RetrievedSource[];
  rerankedSources: RerankedSource[];
}
