import { RerankResult } from "./reranker.js";

/**
 * System and user prompts for the RAG LLM.
 */
export const PROMPTS = {
  SYSTEM_INSTRUCTION: `You are an elite, production-grade Retrieval-Augmented Generation (RAG) assistant.
Your main goal is to answer the user's questions based strictly and exclusively on the retrieved document context provided.

RULES FOR RESPONSE GENERATION:
1. TRUTHFULNESS: Base your entire answer ONLY on the retrieved document context. Do not extrapolate, assume, or bring in outside knowledge.
2. ABSENCE OF INFORMATION: If the provided context does not contain sufficient information to answer the question, say precisely and politely: "I am sorry, but the provided documentation does not contain enough information to answer this query." Do not attempt to synthesize an answer.
3. INLINE CITATIONS: Whenever you state a fact or point derived from a chunk, insert an inline citation pointing to the source file and page/chunk index (e.g., "[Source: Document_Name, Page X]").
4. STYLE: Maintain a highly professional, polite, objective, and clear tone. Structure your answers with clear paragraphs and bullet points where helpful.
5. NO HALLUCINATION: Under no circumstances are you allowed to hallucinate or make up facts.`,

  /**
   * Constructs the final user prompt with context blocks and the user query.
   */
  buildUserPrompt(query: string, contexts: RerankResult[]): string {
    const contextText = contexts
      .map((c, idx) => {
        const meta = c.chunk.metadata;
        return `[DOCUMENT CHUNK ${idx + 1}]
Source File: ${meta.filename}
Page Number: ${meta.pageNumber}
Chunk Index: ${meta.chunkIndex}
Semantic Match Score (Reranked): ${c.rerankedScore.toFixed(3)}
Content:
"${c.chunk.text}"`;
      })
      .join("\n\n--------------------------------------------------\n\n");

    return `Retrieved Context Documents:
==================================================
${contextText || "NO RELEVANT CONTEXT FOUND"}
==================================================

User Query:
"${query}"

Answer the query using the context documents above. Remember to apply the professional RAG rules, cite your sources inline, and state if information is insufficient:`;
  }
};
