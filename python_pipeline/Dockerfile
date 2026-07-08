# Production-Grade Multi-stage Dockerfile
FROM python:3.10-slim as builder

WORKDIR /code

# Install build dependencies for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies into a separate directory for space optimization
RUN pip install --no-cache-dir --user -r requirements.txt

# Final target container stage
FROM python:3.10-slim as runner

WORKDIR /code

# Copy system dependencies and library paths
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Ensure logs and databases have persistent read-write rights
RUN mkdir -p chroma_db logs data && chmod 777 chroma_db logs data

COPY . .

ENV PORT=8000
EXPOSE 8000

# Start production uvicorn server binding on all interfaces
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
