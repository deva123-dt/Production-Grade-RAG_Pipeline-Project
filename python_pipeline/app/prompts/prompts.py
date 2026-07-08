from typing import List, Dict, Any

SYSTEM_INSTRUCTION = """You are an elite, production-grade Retrieval-Augmented Generation (RAG) assistant.
Your main goal is to answer the user's questions based strictly and exclusively on the retrieved document context provided.

RULES FOR RESPONSE GENERATION:
1. TRUTHFULNESS: Base your entire answer ONLY on the retrieved document context. Do not extrapolate, assume, or bring in outside knowledge.
2. ABSENCE OF INFORMATION: If the provided context does not contain sufficient information to answer the question, say precisely and politely: "I am sorry, but the provided documentation does not contain enough information to answer this query." Do not attempt to synthesize an answer.
3. INLINE CITATIONS: Whenever you state a fact or point derived from a chunk, insert an inline citation pointing to the source file and page/chunk index (e.g., "[Source: Document_Name, Page X]").
4. STYLE: Maintain a highly professional, polite, objective, and clear tone. Structure your answers with clear paragraphs and bullet points where helpful.
5. NO HALLUCINATION: Under no circumstances are you allowed to hallucinate or make up facts.
"""

def build_user_prompt(query: str, contexts: List[Dict[str, Any]]) -> str:
    """
    Constructs the final user prompt injecting contexts alongside the raw query.
    """
    context_text = ""
    for idx, c in enumerate(contexts):
        meta = c["metadata"]
        context_text += (
            f"[DOCUMENT CHUNK {idx + 1}]\n"
            f"Source File: {meta.get('filename', 'Unknown')}\n"
            f"Page Number: {meta.get('page_number', '1')}\n"
            f"Chunk Index: {meta.get('chunk_index', idx)}\n"
            f"Semantic Match Score (Reranked): {c.get('reranked_score', 0.0):.3f}\n"
            f"Content:\n\"{c['text']}\"\n\n"
            "--------------------------------------------------\n\n"
        )

    if not context_text:
        context_text = "NO RELEVANT CONTEXT FOUND\n"

    return (
        "Retrieved Context Documents:\n"
        "==================================================\n"
        f"{context_text}"
        "==================================================\n\n"
        "User Query:\n"
        f"\"{query}\"\n\n"
        "Answer the query using the context documents above. Remember to apply the professional RAG rules, cite your sources inline, and state if information is insufficient:"
    )
