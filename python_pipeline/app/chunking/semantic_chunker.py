import re
from typing import List, Dict, Any, Tuple
import numpy as np
from app.embeddings.embeddings import embedding_engine
from app.utils.logging import logger

class SemanticChunker:
    """
    Semantic Chunking Module.
    Avoids static/arbitrary fixed-token limits by dynamically evaluating sentence vectors and 
    splitting documents only at semantic transition peaks.
    """
    def __init__(self, percentile_threshold: int = 80, fallback_max_chars: int = 1500):
        self.percentile_threshold = percentile_threshold
        self.fallback_max_chars = fallback_max_chars

    def split_into_sentences(self, text: str) -> List[str]:
        """
        Splits a text document into sentences using advanced punctuation mapping.
        """
        sentence_regex = r'[^.!?]+[.!?]+(?:\s|\n|$)|[^.!?]+(?:\s|\n|$)'
        sentences = re.findall(sentenceRegex := sentence_regex, text)
        return [s.strip() for s in sentences if s.strip()]

    def cosine_similarity(self, u: np.ndarray, v: np.ndarray) -> float:
        """
        Calculates cosine similarity between two 1D arrays.
        """
        dot = np.dot(u, v)
        norm_u = np.linalg.norm(u)
        norm_v = np.linalg.norm(v)
        if norm_u == 0 or norm_v == 0:
            return 0.0
        return float(dot / (norm_u * norm_v))

    def chunk_document(self, text: str, source_info: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Performs semantic grouping based on embedding distances.
        
        Returns:
            - A list of dictionary objects representing extracted chunks.
            - Visual data for plotting embedding distances.
        """
        sentences = self.split_into_sentences(text)
        if not sentences:
            return [], {"sentences": [], "distances": [], "threshold": 0, "splits": []}

        logger.info(f"Splitting document into sentences. Extracted {len(sentences)} sentence nodes.")

        # Batch compute embeddings for all sentences
        embeddings = [np.array(emb) for emb in embedding_engine.get_embeddings_batch(sentences)]

        # Calculate semantic distances between adjacent sentences (1 - Cosine Similarity)
        distances = []
        for i in range(len(sentences) - 1):
            similarity = self.cosine_similarity(embeddings[i], embeddings[i + 1])
            distances.append(1.0 - similarity)

        # Compute dynamic threshold based on the specified percentile
        threshold = 0.5
        if distances:
            threshold = float(np.percentile(distances, self.percentile_threshold))

        logger.info(f"Semantic chunking distance calculated. Selected threshold distance: {threshold:.3f}")

        # Segments sentence arrays at boundary crossings
        splits = [0]
        for idx, dist in enumerate(distances):
            if dist > threshold:
                splits.append(idx + 1)

        chunks = []
        filename = source_info.get("filename", "unknown_document")
        source = source_info.get("source", "uploaded_file")

        for i, start_idx in enumerate(splits):
            end_idx = splits[i + 1] if i + 1 < len(splits) else len(sentences)
            chunk_sentences = sentences[start_idx:end_idx]
            chunk_text = " ".join(chunk_sentences)

            # Safety fallback for exceedingly long text frames
            if len(chunk_text) > self.fallback_max_chars and len(chunk_sentences) > 2:
                mid = len(chunk_sentences) // 2
                
                # Split A
                text_a = " ".join(chunk_sentences[:mid])
                chunks.append({
                    "id": f"{filename}_c{len(chunks)}",
                    "text": text_a,
                    "metadata": {
                        "filename": filename,
                        "source": source,
                        "page_number": (start_idx // 15) + 1,
                        "chunk_index": len(chunks),
                        "sentences_count": len(chunk_sentences[:mid])
                    }
                })
                # Split B
                text_b = " ".join(chunk_sentences[mid:])
                chunks.append({
                    "id": f"{filename}_c{len(chunks)}",
                    "text": text_b,
                    "metadata": {
                        "filename": filename,
                        "source": source,
                        "page_number": ((start_idx + mid) // 15) + 1,
                        "chunk_index": len(chunks),
                        "sentences_count": len(chunk_sentences[mid:])
                    }
                })
            else:
                chunks.append({
                    "id": f"{filename}_c{len(chunks)}",
                    "text": chunkText := chunk_text,
                    "metadata": {
                        "filename": filename,
                        "source": source,
                        "page_number": (start_idx // 15) + 1,
                        "chunk_index": len(chunks),
                        "sentences_count": len(chunk_sentences)
                    }
                })

        logger.info(f"Semantic document segmenting completed. Created {len(chunks)} cohesive nodes.")

        visual_data = {
            "sentences": sentences,
            "distances": distances,
            "threshold": threshold,
            "splits": splits
        }

        return chunks, visual_data
