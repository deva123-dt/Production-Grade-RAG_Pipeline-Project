import { GoogleGenAI } from "@google/genai";
import { CONFIG } from "./config.js";

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!CONFIG.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required to generate real embeddings. Please configure it in your Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: CONFIG.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/**
 * Generate high-quality dense vector embeddings using Google's modern embedding model.
 * Falls back to deterministic mock vectors if API key is missing, so the app remains fully
 * testable and interactive even before keys are supplied.
 */
async function embedWithRetry(client: GoogleGenAI, text: string, retries = 4, baseDelay = 1000): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: text,
      });
      const values = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error("No embedding values returned from Gemini API");
      }
      return values;
    } catch (err: any) {
      if (attempt === retries) {
        throw err;
      }
      const isRateLimit = err.status === 429 || err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
      const waitTime = isRateLimit ? baseDelay * Math.pow(2, attempt) + Math.random() * 500 : 500;
      console.warn(`Embedding failed (attempt ${attempt}/${retries}). Retrying in ${Math.round(waitTime)}ms... Text: "${text.substring(0, 30)}...". Error: ${err.message || err}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error("Failed to generate embedding after retries");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!CONFIG.GEMINI_API_KEY) {
    // Generate a reproducible pseudo-embedding based on string hashing for local demo safety
    return generateDeterministicMockEmbedding(text);
  }

  try {
    const client = getAiClient();
    return await embedWithRetry(client, text, 4, 1000);
  } catch (error: any) {
    console.error("Embedding generation failed, falling back to deterministic vector:", error.message || error);
    return generateDeterministicMockEmbedding(text);
  }
}

/**
 * Generate a batch of embeddings in parallel or sequence, depending on rate limits.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // If no key, generate mock vectors instantly
  if (!CONFIG.GEMINI_API_KEY) {
    return texts.map(generateDeterministicMockEmbedding);
  }

  try {
    const client = getAiClient();
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i++) {
      // Add a slight stagger/delay between requests to avoid concurrent rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      try {
        const values = await embedWithRetry(client, texts[i], 4, 1000);
        results.push(values);
      } catch (err: any) {
        console.warn(`Failed embedding for chunk: "${texts[i].substring(0, 30)}...". Using fallback vector. Error: ${err.message || err}`);
        results.push(generateDeterministicMockEmbedding(texts[i]));
      }
    }
    
    return results;
  } catch (error) {
    console.error("Batch embedding generation failed, using mock embeddings:", error);
    return texts.map(generateDeterministicMockEmbedding);
  }
}

/**
 * Creates a normalized 768-dimensional mock embedding based on character distributions.
 * This ensures that vector similarity operations (dot product, cosine) still return
 * reasonable, content-dependent results for demonstration purposes without throwing errors.
 */
export function generateDeterministicMockEmbedding(text: string): number[] {
  const size = 768; // Gemini embedding dimension size
  const vector = new Array(size).fill(0);
  
  // Basic hash-based seeding
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (i * 31 + charCode) % size;
    vector[index] += charCode / 255.0;
  }
  
  // Smooth and normalize the vector
  let magnitude = 0;
  for (let i = 0; i < size; i++) {
    vector[i] = (vector[i] || 0.1) + Math.sin(i * 0.1) * 0.05;
    magnitude += vector[i] * vector[i];
  }
  
  magnitude = Math.sqrt(magnitude);
  for (let i = 0; i < size; i++) {
    vector[i] = vector[i] / (magnitude || 1);
  }
  
  return vector;
}
