import pytest
import numpy as np
from app.chunking.semantic_chunker import SemanticChunker
from app.embeddings.embeddings import embedding_engine
from app.reranker.flashrank_reranker import FlashRankReranker
from app.llm.llm_client import RAGLLMClient

def test_sentence_splitter():
    """
    Tests sentence segmentation logic.
    """
    chunker = SemanticChunker()
    sample_text = "This is sentence one. Sentence two! And sentence three?"
    sentences = chunker.split_into_sentences(sample_text)
    
    assert len(sentences) == 3
    assert sentences[0] == "This is sentence one."
    assert sentences[1] == "Sentence two!"
    assert sentences[2] == "And sentence three?"

def test_deterministic_embedding_generation():
    """
    Verifies reproducibility and shape validity of offline mock embeddings generator.
    """
    vector_a = embedding_engine._generate_deterministic_fallback_vector("Hello World")
    vector_b = embedding_engine._generate_deterministic_fallback_vector("Hello World")
    vector_c = embedding_engine._generate_deterministic_fallback_vector("Something completely different")

    assert len(vector_a) == 768
    assert np.allclose(vector_a, vector_b)
    assert not np.allclose(vector_a, vector_c)
    # Norm check (normalized dense vector)
    assert np.isclose(np.linalg.norm(vector_a), 1.0)

def test_semantic_distance_chunking():
    """
    Verifies document splitting and percentile-threshold boundary generation.
    """
    chunker = SemanticChunker(percentile_threshold=50)
    sample_doc = (
        "Human Resources handles payroll and recruitment services. "
        "Employees accrue annual vacation days on a monthly cycle. "
        "Kubernetes clusters orchestrate microservices in our cloud platform. "
        "Docker containers isolate environment runtimes during deployment cycles."
    )
    source_info = {"filename": "test_doc.txt", "source": "unit_test"}
    chunks, visual_data = chunker.chunk_document(sample_doc, source_info)

    assert len(chunks) > 0
    # Confirm distances exists
    assert len(visual_data["distances"]) == 3
    # Splits array should seed 0 as initial
    assert visual_data["splits"][0] == 0

def test_fallback_reranking_order():
    """
    Confirms local keyword-similarity re-ranking sorts terms accurately.
    """
    reranker = FlashRankReranker()
    query = "vacation benefits"
    
    candidates = [
        {
            "id": "c1",
            "text": "Kubernetes runs server clusters in secondary container zones.",
            "similarity": 0.8
        },
        {
            "id": "c2",
            "text": "Employee handbooks list policy guidelines for annual paid vacation benefits and wellness.",
            "similarity": 0.4
        }
    ]

    reranked = reranker._local_linguistic_rerank(query, candidates)
    
    # c2 should rank ahead of c1 now due to terms overlap despite c1 having higher starting vector similarity
    assert reranked[0]["id"] == "c2"
    assert reranked[0]["reranked_score"] > reranked[1]["reranked_score"]

def test_llm_failover_routing():
    """
    Tests that LLM Client falls back gracefully to secondary engines in absence of API keys.
    """
    client = RAGLLMClient()
    # Force mock API state by unbinding clients
    client.gemini_client = None
    client.groq_client = None

    query = "What is the standard vacation allowance?"
    contexts = [
        {
            "id": "doc1_c1",
            "text": "Employees receive 25 days of Paid Time Off (PTO) annually, accrued monthly.",
            "metadata": {"filename": "handbook.pdf", "page_number": 3, "chunk_index": 0}
        }
    ]

    answer, model_used, is_fallback, latency = client.generate_answer(query, contexts)

    assert is_fallback is True
    assert "SYSTEM FAILOVER" in answer or "heuristic" in answer
    assert "25 days" in answer
    assert model_used == "Local Reasoning Fallback Engine"
