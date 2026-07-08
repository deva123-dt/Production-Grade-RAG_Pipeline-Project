import { GoogleGenAI } from "@google/genai";
import { CONFIG } from "./config.js";
import { PROMPTS } from "./prompts.js";
import { RerankResult } from "./reranker.js";

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!CONFIG.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in your Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: CONFIG.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiClient;
}

export interface LLMResponse {
  answer: string;
  modelUsed: string;
  isFallbackUsed: boolean;
  latencyMs: number;
  promptTokens?: number;
  candidatesTokens?: number;
}

/**
 * Executes response generation with automatic LLM Fallback routing.
 * 
 * If Gemini 3.5 Flash (Primary) fails or experiences rate limits, it automatically
 * switches to Gemini 3.1 Pro (or another high-tier fallback model) seamlessly.
 * If API keys are missing, it executes a high-fidelity mock fallback generator
 * to maintain fully testable UI operation.
 */
export async function generateRAGAnswer(
  query: string,
  contexts: RerankResult[]
): Promise<LLMResponse> {
  const startTime = Date.now();
  const prompt = PROMPTS.buildUserPrompt(query, contexts);

  // Fallback if API keys are not loaded yet
  if (!CONFIG.GEMINI_API_KEY) {
    const latency = Date.now() - startTime;
    return generateMockRAGAnswer(query, contexts, latency);
  }

  // Define LLM routing queue
  const modelsQueue = [
    { name: "gemini-3.5-flash", label: "Gemini 3.5 Flash (Primary)" },
    { name: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Fallback / Paid)" },
  ];

  let lastError: any = null;

  for (let i = 0; i < modelsQueue.length; i++) {
    const modelItem = modelsQueue[i];
    try {
      console.log(`[LLM Router] Routing query to ${modelItem.label}...`);
      const client = getAiClient();
      
      const response = await client.models.generateContent({
        model: modelItem.name,
        contents: prompt,
        config: {
          systemInstruction: PROMPTS.SYSTEM_INSTRUCTION,
          temperature: 0.2, // Lower temperature for RAG grounding accuracy
        },
      });

      const answer = response.text || "No response received.";
      const latencyMs = Date.now() - startTime;

      return {
        answer,
        modelUsed: modelItem.label,
        isFallbackUsed: i > 0,
        latencyMs,
      };
    } catch (err: any) {
      console.error(`[LLM Router] ${modelItem.label} failed:`, err.message || err);
      lastError = err;
      // Continue to next model in queue (fallback)
    }
  }

  // If all models in queue failed, do a fallback log and return mock response with a banner
  const latencyMs = Date.now() - startTime;
  console.warn("[LLM Router] All real models failed. Returning high-fidelity local response.");
  
  const mockResp = generateMockRAGAnswer(query, contexts, latencyMs);
  return {
    ...mockResp,
    answer: `⚠️ [SYSTEM FAILOVER] Gemini APIs encountered an error, falling back to local reasoning engine.\n\nError details: ${lastError?.message || lastError}\n\n${mockResp.answer}`,
  };
}

/**
 * High-fidelity fallback/mock reasoning engine that parses the contexts locally
 * and formats an answer. This keeps the application 100% interactive under all circumstances.
 */
function generateMockRAGAnswer(
  query: string,
  contexts: RerankResult[],
  latencyMs: number
): LLMResponse {
  if (contexts.length === 0) {
    return {
      answer: "I am sorry, but the provided documentation does not contain enough information to answer this query.",
      modelUsed: "Local Fallback Engine",
      isFallbackUsed: true,
      latencyMs,
    };
  }

  // Simple linguistic extractor for a smart local response
  const queryWords = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let bestContext = contexts[0];
  
  // Try to find the context that has the highest keyword overlap
  let maxOverlap = 0;
  for (const c of contexts) {
    let overlap = 0;
    const text = c.chunk.text.toLowerCase();
    for (const word of queryWords) {
      if (text.includes(word)) overlap++;
    }
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestContext = c;
    }
  }

  const meta = bestContext.chunk.metadata;
  const answer = `Based on the provided documentation for ${meta.filename} (Page ${meta.pageNumber}, Chunk ${meta.chunkIndex}), here is what we found matching your search for "${query}":

${bestContext.chunk.text.split(/[.!?]+/).slice(0, 3).join(". ") + "."}

[Source: ${meta.filename}, Page ${meta.pageNumber}]`;

  return {
    answer,
    modelUsed: "Local Fallback Engine",
    isFallbackUsed: true,
    latencyMs,
  };
}
