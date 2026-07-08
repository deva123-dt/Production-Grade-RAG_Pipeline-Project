from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config.config import settings
from app.utils.logging import logger

class ChromaVectorStore:
    """
    ChromaDB Vector Store Wrapper.
    Handles persistent disk indexing, semantic chunk synchronization, and cosine-based matches.
    """
    def __init__(self):
        # Configure ChromaDB to store persistently to disk
        self.chroma_client = chromadb.PersistentClient(
            path=str(settings.CHROMA_DB_DIR)
        )
        # Configure cosine similarity distance
        self.collection = self.chroma_client.get_or_create_collection(
            name="rag_knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )
        logger.info(f"Persistent ChromaDB store loaded. Collection 'rag_knowledge_base' active.")

    def add_chunks(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """
        Adds semantic chunks with pre-generated vectors to ChromaDB.
        Avoids duplicates by cleaning previous indexes belonging to the same filename.
        """
        if not chunks:
            return

        filenames = list(set(c["metadata"]["filename"] for c in chunks))
        for fname in filenames:
            self.delete_by_filename(fname)

        ids = [c["id"] for c in chunks]
        texts = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
        logger.info(f"Synchronized {len(chunks)} chunks into ChromaDB for files: {filenames}")

    def query(self, query_vector: List[float], top_k: int = 4, filename_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retrieves Top-K document chunks from ChromaDB based on embedding similarity.
        """
        where_filter = {}
        if filename_filter:
            where_filter = {"filename": filename_filter}

        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=top_k,
            where=where_filter if where_filter else None,
            include=["documents", "metadatas", "distances"]
        )

        formatted_results = []
        if results and results["documents"] and results["documents"][0]:
            documents = results["documents"][0]
            metadatas = results["metadatas"][0]
            distances = results["distances"][0]
            ids = results["ids"][0]

            for i in range(len(documents)):
                # Chroma distances for cosine is typically 1 - similarity. Let's map back to similarity.
                similarity = 1.0 - distances[i]
                formatted_results.append({
                    "id": ids[i],
                    "text": documents[i],
                    "metadata": metadatas[i],
                    "similarity": float(similarity)
                })

        return formatted_results

    def delete_by_filename(self, filename: str):
        """
        Deletes all chunks associated with a specific document file from the index.
        """
        try:
            self.collection.delete(where={"filename": filename})
            logger.debug(f"Cleared existing indexes in Chroma for document: {filename}")
        except Exception as e:
            logger.warning(f"Failed to clear old index slice for {filename}: {e}")

    def get_all_documents(self) -> List[Dict[str, Any]]:
        """
        Computes the list of distinctive ingested documents present in ChromaDB.
        """
        results = self.collection.get(include=["metadatas"])
        if not results or not results["metadatas"]:
            return []

        doc_summary = {}
        for meta in results["metadatas"]:
            filename = meta["filename"]
            if filename not in doc_summary:
                doc_summary[filename] = {
                    "filename": filename,
                    "source": meta.get("source", "unknown"),
                    "chunksCount": 0
                }
            doc_summary[filename]["chunksCount"] += 1

        return list(doc_summary.values())

    def clear_database(self):
        """
        Resets and flushes the entire vector database index.
        """
        self.chroma_client.delete_collection("rag_knowledge_base")
        self.collection = self.chroma_client.get_or_create_collection(
            name="rag_knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )
        logger.warning("Flushed ChromaDB active collections on request.")

# Export singleton
chroma_store = ChromaVectorStore()
