# Production-Grade Retrieval-Augmented Generation (RAG) Pipeline

A complete, production-ready Retrieval-Augmented Generation (RAG) pipeline designed and implemented across both an interactive full-stack **TypeScript Dashboard (React + Express)** and a production-grade **Python Backend (FastAPI + ChromaDB + FlashRank)**.

---

## 🛠️ System Architecture

Below is the ASCII representation of the end-to-end RAG system flow, illustrating how a document is processed, stored, and queried with multi-stage reranking and fallback routing.

```text
====================================================================================================
                                      INGESTION PIPELINE STAGE
====================================================================================================
 
  [Raw Documents] (.pdf, .docx, .md, .txt)
         │
         ▼
  [Sentence Splitter] (Regex-based clause boundaries)
         │
         ▼
  [Embeddings Generation] ──► (gemini-embedding-2-preview)
         │
         ▼
  [Distance Gradient Analyzer] ──► (1 - Cosine Similarity)
         │
         ▼
  [Semantic Chunker] (Splits triggers at percentile thresholds)
         │
         ▼
  [Vector Synchronization] ──► (ChromaDB / JSON Vector Store)
 
====================================================================================================
                                      QUERY PIPELINE STAGE
====================================================================================================
 
       [User Natural Language Query]
                     │
                     ▼
       [Query Embedding Generator] (gemini-embedding-2-preview)
                     │
                     ▼
         [ChromaDB Vector Matching] (Top-K Similarity Retrieval)
                     │
                     ▼
         [FlashRank Reranker] (Cross-Encoder deep semantic re-scoring)
                     │
                     ▼
       [Cited Prompt Synthesis] (System and Context templates injected)
                     │
                     ├───────────────────────────┐
                     ▼ (Try Primary)             ▼ (Auto Failover)
           [Google Gemini 1.5 Flash]    [Groq (Llama3) / Gemini Pro Fallback]
                     │                           │
                     └─────────────┬─────────────┘
                                   ▼
                       [Source-Cited Answer]
```

---

## 🌟 Key Capabilities & Module Architecture

### 1. Semantic Chunking
Instead of splitting documents by fixed-character windows (which destroys sentence context), this pipeline uses **semantic chunking**. It:
- Segments the text into complete, grammatically sound clauses/sentences.
- Computes high-dimensional vectors for each sentence using `gemini-embedding-2-preview`.
- Evaluates the cosine distance threshold between adjacent sentences.
- Automatically inserts split boundaries at peak semantic distances (above the configured percentile threshold).

### 2. High-Performance Vector Storage
- Supports persistent database structures using **ChromaDB** (Python) and a robust in-memory vector store with persistence (TypeScript).
- Embeddings are generated deterministically and stored side-by-side with rich metadata (source, page index, chunk index).

### 3. FlashRank Reranking
- In standard RAG pipelines, vector similarity matching often retrieves fragments containing matching words but lacking overall relevance.
- This pipeline implements **FlashRank (Cross-Encoder)** reranking to re-score candidates based on deep contextual relevance to the query.
- Evaluates rank-shifting and updates the priority of document nodes dynamically before passing them to the generator.

### 4. Dual-LLM Auto-Failover Routing
- Primary Engine: **Google Gemini 1.5 Flash** (via the modern `@google/genai` client).
- Secondary Fallback: **Groq API** (`llama3-70b-8192`) or **Gemini Pro**.
- Local Heuristic fallback ensures zero system downtime during rate limits or network issues.

---

## 🚀 Quick Start Guide

This project is structured as a dual-backend prototype to support both quick-interactive UI experiences and local production deployment.

### 1. Running the Interactive React + Express Dashboard
To run the full-stack TypeScript web application locally:

```bash
# 1. Install workspace dependencies
npm install

# 2. Start the integrated Dev Server (Binds to Port 3000)
npm run dev
```

Open your browser to `http://localhost:3000` to interact with:
- The **Interactive Semantic Chunking Distance Chart** (SVG-rendered).
- **Comparative Reranking Precision Audits** (Side-by-side similarity vs reranked confidence table).
- Dynamic, color-coded **Rolling Logs Terminal**.

---

### 2. Running the Python Production Pipeline (FastAPI)
The production FastAPI containerized setup resides inside `/python_pipeline`.

#### Run Locally:
```bash
cd python_pipeline

# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install production dependencies
pip install -r requirements.txt

# 3. Launch the API server
uvicorn app.api.main:app --reload --port 8000
```

#### Run with Docker:
```bash
cd python_pipeline
docker-compose up --build
```

#### Running Pipeline Unit Tests:
```bash
cd python_pipeline
pytest tests/
```

---

## 📈 Endpoint References (FastAPI)

- `GET /health`: Returns connection state, ChromaDB collection status, and loaded LLM backends.
- `POST /upload`: Ingests document body, splits semantically, and indexes chunks.
- `POST /ingest`: Scans local `/data` directory and bulk-indexes documents.
- `POST /query`: Processes full Retrieval-Rerank-Generation query loop and returns source-cited answer.
- `POST /clear`: Flushes the entire vector index.
