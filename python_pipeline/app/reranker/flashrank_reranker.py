from typing import List, Dict, Any
from app.utils.logging import logger

class FlashRankReranker:
    """
    Reranker Module.
    Uses FlashRank (cross-encoder model) to evaluate deep contextual relevance of chunks
    relative to user queries. Improves response quality by sorting high-relevance chunks
    to the top.
    """
    def __init__(self):
        self.ranker = None
        try:
            from flashrank import Ranker
            # Initialize a lightweight fast model (e.g. ms-marco-MiniLM-L-6-v2)
            self.ranker = Ranker(model_name="ms-marco-MiniLM-L-6-v2")
            logger.info("FlashRank Ranker successfully initialized.")
        except Exception as e:
            logger.warning(f"Could not load native FlashRank library or model weights: {e}. Activating high-fidelity fallback reranking.")

    def rerank(self, query: str, retrieved_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Reranks the list of candidates using a Cross-Encoder scoring model.
        """
        if not retrieved_items:
            return []

        logger.info(f"Re-scoring {len(retrieved_items)} retrieved items using FlashRank cross-encoder...")

        if self.ranker:
            try:
                from flashrank import RerankRequest
                
                # Format to flashrank expectations
                passages = [
                    {
                        "id": item["id"],
                        "text": item["text"],
                        "meta": item["metadata"]
                    }
                    for item in retrieved_items
                ]
                
                request = RerankRequest(query=query, passages=passages)
                results = self.ranker.rerank(request)

                # Combine results back with original metrics for logging comparisons
                reranked_results = []
                for res in results:
                    # Find original match item to extract original score
                    orig_item = next(x for x in retrieved_items if x["id"] == res["id"])
                    reranked_results.append({
                        "id": res["id"],
                        "text": res["text"],
                        "metadata": res["meta"],
                        "original_similarity": orig_item["similarity"],
                        "reranked_score": float(res["score"])
                    })
                
                # Sort descending by reranked score
                reranked_results.sort(key=lambda x: x["reranked_score"], reverse=True)
                return reranked_results
            except Exception as e:
                logger.error(f"FlashRank execution error: {e}. Utilizing fallback linguistic reranking.")

        return self._local_linguistic_rerank(query, retrieved_items)

    def _local_linguistic_rerank(self, query: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Locally re-scores documents using a blended keyword overlap metric.
        """
        query_words = set(query.lower().split())
        reranked_results = []

        for item in items:
            text = item["text"].lower()
            text_words = set(re_split := text.split())
            
            # Count matches
            overlap = len(query_words.intersection(text_words))
            overlap_ratio = overlap / len(query_words) if query_words else 0.0
            
            # Simple blended score (50% vector similarity + 50% keyword density/overlap)
            reranked_score = float(item["similarity"] * 0.5 + (overlap_ratio * 0.4 + 0.1) * 0.5)
            
            reranked_results.append({
                "id": item["id"],
                "text": item["text"],
                "metadata": item["metadata"],
                "original_similarity": item["similarity"],
                "reranked_score": round(reranked_score, 3)
            })

        reranked_results.sort(key=lambda x: x["reranked_score"], reverse=True)
        return reranked_results

# Export singleton
reranker_engine = FlashRankReranker()
