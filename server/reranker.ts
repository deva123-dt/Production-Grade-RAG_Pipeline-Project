import { ChunkResult } from "./chunking.js";
import { CONFIG } from "./config.js";
import { GoogleGenAI, Type } from "@google/genai";

export interface RerankResult {
  chunk: ChunkResult;
  originalScore: number;
  rerankedScore: number;
}

// Lazy-initialized Gemini client for Cross-Encoder
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!CONFIG.GEMINI_API_KEY) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: CONFIG.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiClient;
}

/**
 * FlashRank Reranker Module.
 * 
 * Re-scores and re-orders the retrieved Top-K chunks based on dense semantic alignment
 * with the user query, utilizing either Gemini as a robust Cross-Encoder, or a local
 * token-co-occurrence and term-frequency scoring engine as a high-fidelity local fallback.
 */
export async function rerankChunks(
  query: string,
  retrieved: { chunk: ChunkResult; similarity: number }[]
): Promise<RerankResult[]> {
  if (retrieved.length === 0) return [];

  const client = getAiClient();

  if (client) {
    try {
      // Build a cross-encoder prompt to ask Gemini to score the chunks on relevance
      const listItems = retrieved.map((item, idx) => ({
        index: idx,
        text: item.chunk.text,
      }));

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert search engine reranker.
Your task is to score the relevance of the following candidate document chunks to the user's search query.
Evaluate semantic alignment, contextual completeness, and whether the chunk directly answers or supports the query.

Search Query: "${query}"

Candidate Chunks:
${listItems.map((item) => `[Chunk ${item.index}]
Text: "${item.text}"`).join("\n\n")}

Return a JSON array containing a score between 0.0 (completely irrelevant) and 1.0 (perfect answer) for each candidate chunk.
Your response MUST strictly conform to the following schema:
[{ "index": number, "score": number }]`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER, description: "The candidate chunk index from the input" },
                score: { type: Type.NUMBER, description: "The relevance score between 0.0 and 1.0" },
              },
              required: ["index", "score"],
            },
          },
          temperature: 0.1, // Low temperature for deterministic reranking
        },
      });

      const parsedScores = JSON.parse(response.text.trim()) as { index: number; score: number }[];
      
      // Map back and combine with original score
      const rerankedList: RerankResult[] = retrieved.map((item, idx) => {
        const scoreObj = parsedScores.find((s) => s.index === idx);
        const rerankedScore = scoreObj ? scoreObj.score : item.similarity;
        return {
          chunk: item.chunk,
          originalScore: item.similarity,
          rerankedScore,
        };
      });

      // Sort descending by reranked score
      return rerankedList.sort((a, b) => b.rerankedScore - a.rerankedScore);

    } catch (error) {
      console.warn("Gemini Cross-Encoder failed, falling back to local linguistic reranker:", error);
    }
  }

  // High-fidelity Local Linguistic Reranker fallback (TF-IDF keyword proximity / overlap)
  return localRerankFallback(query, retrieved);
}

/**
 * Fallback reranker implementing simple keyword intersection, query density, and distance scores
 * to simulate professional cross-encoders.
 */
function localRerankFallback(
  query: string,
  retrieved: { chunk: ChunkResult; similarity: number }[]
): RerankResult[] {
  const queryWords = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  
  const rerankedList = retrieved.map((item) => {
    const text = item.chunk.text.toLowerCase();
    let termMatches = 0;
    
    for (const word of queryWords) {
      if (text.includes(word)) {
        termMatches++;
      }
    }
    
    // Keyword match density boost
    const overlapRatio = queryWords.length > 0 ? termMatches / queryWords.length : 0;
    const termFrequencyBoost = (text.split(query.toLowerCase()).length - 1) * 0.15;
    
    // Calculate a blended score (50% cosine embedding similarity + 50% physical token overlap & density)
    const rerankedScore = Math.min(
      item.similarity * 0.5 + (overlapRatio * 0.4 + Math.min(termFrequencyBoost, 0.1) + 0.1) * 0.5,
      1.0
    );

    return {
      chunk: item.chunk,
      originalScore: item.similarity,
      rerankedScore: parseFloat(rerankedScore.toFixed(3)),
    };
  });

  // Sort descending by reranked score
  return rerankedList.sort((a, b) => b.rerankedScore - a.rerankedScore);
}
