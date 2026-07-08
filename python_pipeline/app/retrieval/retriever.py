from typing import List, Dict, Any, Optional
from app.embeddings.embeddings import embedding_engine
from app.vectorstore.chroma_store import chroma_store
from app.utils.logging import logger

class SemanticRetriever:
    """
    Retrieval Module.
    Takes a natural language query, generates its embedding, and matches documents in
    the local persistent ChromaDB collection.
    """
    def __init__(self, default_top_k: int = 4):
        self.default_top_k = default_top_k

    def retrieve(self, query: str, top_k: Optional[int] = None, filename_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Converts query to embeddings and performs Top-K similarity matching.
        """
        k = top_k or self.default_top_k
        logger.info(f"Querying vector database: '{query}' (Target Top-K: {k}, Filter: {filename_filter})")

        # 1. Generate query embedding vector
        query_vector = embedding_engine.get_embedding(query)

        # 2. Match documents in ChromaDB
        results = chroma_store.query(
            query_vector=query_vector,
            top_k=k,
            filename_filter=filename_filter
        )

        logger.info(f"Retrieval returned {len(results)} candidate text segments.")
        return results

# Export singleton
retriever = SemanticRetriever()
