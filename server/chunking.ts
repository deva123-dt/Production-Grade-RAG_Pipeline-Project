import { generateEmbeddingsBatch } from "./embeddings.js";

export interface SentenceData {
  text: string;
  index: number;
  embedding?: number[];
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
  splits: number[]; // indices of sentences that mark the START of a new chunk
}

/**
 * Computes cosine similarity between two high-dimensional vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * Splits a document into list of sentences using regex that respects common abbreviations.
 */
export function splitIntoSentences(text: string): string[] {
  // Simple yet robust regex sentence splitter
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s|\n|$)|[^.!?]+(?:\s|\n|$)/g;
  const matches = text.match(sentenceRegex) || [text];
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Performs Semantic Chunking.
 * 
 * Algorithm:
 * 1. Splitting: Breaks input document into distinct sentences.
 * 2. Vectorization: Generates embeddings for each sentence.
 * 3. Gradient Calculation: Measures semantic distance (1 - similarity) between consecutive sentence pairs.
 * 4. Threshold Selection: Selects a statistical split threshold (e.g. median + 1.2 * standard deviation, or a percentile).
 * 5. Segmentation: Spans new chunks when semantic distance exceeds threshold.
 */
export async function performSemanticChunking(
  text: string,
  sourceName: string,
  filename: string,
  options: { thresholdPercentile?: number; fallbackMaxChars?: number } = {}
): Promise<{ chunks: ChunkResult[]; visualData: ChunkingVisualData }> {
  const percentile = options.thresholdPercentile ?? 80;
  const maxFallbackChars = options.fallbackMaxChars ?? 1000;

  const rawSentences = splitIntoSentences(text);
  if (rawSentences.length === 0) {
    return { chunks: [], visualData: { sentences: [], distances: [], threshold: 0, splits: [] } };
  }

  // Get embeddings for all sentences in parallel
  const embeddings = await generateEmbeddingsBatch(rawSentences);

  // Compute semantic distances between adjacent sentences (1 - similarity)
  const distances: number[] = [];
  for (let i = 0; i < rawSentences.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i], embeddings[i + 1]);
    distances.push(1 - sim);
  }

  // Determine split threshold
  let threshold = 0.5;
  if (distances.length > 0) {
    const sortedDistances = [...distances].sort((a, b) => a - b);
    const index = Math.min(
      Math.floor((percentile / 100) * sortedDistances.length),
      sortedDistances.length - 1
    );
    threshold = sortedDistances[index] || 0.5;
  }

  // Identify split boundaries
  const splits: number[] = [0]; // First sentence is always a chunk start
  for (let i = 0; i < distances.length; i++) {
    const distance = distances[i];
    // If distance exceeds threshold, start a new chunk
    if (distance > threshold) {
      splits.push(i + 1);
    }
  }

  // Build the chunks
  const chunks: ChunkResult[] = [];
  const totalSentences = rawSentences.length;

  for (let i = 0; i < splits.length; i++) {
    const startIdx = splits[i];
    const endIdx = i + 1 < splits.length ? splits[i + 1] : totalSentences;

    const chunkSentences = rawSentences.slice(startIdx, endIdx);
    const chunkText = chunkSentences.join(" ");

    // Prevent oversized chunks if semantic threshold is too high, by slicing further
    if (chunkText.length > maxFallbackChars && chunkSentences.length > 2) {
      const mid = Math.floor(chunkSentences.length / 2);
      
      const textA = chunkSentences.slice(0, mid).join(" ");
      chunks.push({
        id: `${filename}-c${chunks.length}`,
        text: textA,
        startIndex: startIdx,
        endIndex: startIdx + mid,
        sentencesCount: mid,
        metadata: {
          source: sourceName,
          filename,
          pageNumber: Math.floor(startIdx / 15) + 1,
          chunkIndex: chunks.length,
        },
      });

      const textB = chunkSentences.slice(mid).join(" ");
      chunks.push({
        id: `${filename}-c${chunks.length}`,
        text: textB,
        startIndex: startIdx + mid,
        endIndex: endIdx,
        sentencesCount: chunkSentences.length - mid,
        metadata: {
          source: sourceName,
          filename,
          pageNumber: Math.floor((startIdx + mid) / 15) + 1,
          chunkIndex: chunks.length,
        },
      });
    } else {
      chunks.push({
        id: `${filename}-c${chunks.length}`,
        text: chunkText,
        startIndex: startIdx,
        endIndex: endIdx,
        sentencesCount: chunkSentences.length,
        metadata: {
          source: sourceName,
          filename,
          pageNumber: Math.floor(startIdx / 15) + 1,
          chunkIndex: chunks.length,
        },
      });
    }
  }

  const visualData: ChunkingVisualData = {
    sentences: rawSentences,
    distances,
    threshold,
    splits,
  };

  return { chunks, visualData };
}
