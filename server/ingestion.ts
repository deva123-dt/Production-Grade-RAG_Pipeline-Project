import { performSemanticChunking, ChunkResult } from "./chunking.js";
import { generateEmbeddingsBatch } from "./embeddings.js";
import { vectorStore } from "./vectorstore.js";

export interface LogItem {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  module: string;
  message: string;
}

// Memory logs container for pipeline tracing
export const systemLogs: LogItem[] = [];

export function addLog(module: string, level: LogItem["level"], message: string) {
  const log: LogItem = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString().split("T")[1].slice(0, 8),
    level,
    module,
    message,
  };
  systemLogs.push(log);
  // Keep logs list trimmed
  if (systemLogs.length > 50) {
    systemLogs.shift();
  }
  console.log(`[${log.timestamp}] [${log.level}] [${log.module}] ${log.message}`);
}

/**
 * Pre-populated mock datasets for zero-config onboarding.
 */
export const PRELOADED_DATASETS = [
  {
    filename: "Employee_Handbook_2026.pdf",
    source: "HR Operations Portal",
    title: "Global HR & Employee Benefits Handbook 2026",
    text: `WELCOME TO GLOBEX CORP. This Corporate Employee Handbook serves as a reference for benefits, expectations, and policies.
    
    1. WORK HOURS AND ATTENDANCE. Standard business hours are 9:00 AM to 5:00 PM local time. Flexible working hours may be arranged with manager approval. Core collaboration hours are 10:00 AM to 3:00 PM EST. Remote employees are expected to be online and available during core hours.
    
    2. PAID TIME OFF (PTO) AND VACATION. Employees receive 25 days of Paid Time Off (PTO) annually, accrued monthly at 2.08 days. PTO must be submitted at least two weeks in advance via the HR Portal. Sick leave is separate, offering 10 paid days per year for wellness and medical recovery. Unused PTO up to 5 days can be rolled over into the next fiscal year.
    
    3. MATERNITY AND PATERNITY LEAVE. Globex is committed to family support. Primary caregivers receive 16 weeks of fully paid parental leave, while secondary caregivers receive 8 weeks of fully paid parental leave. Parental leave can be taken anytime within the first year after birth or adoption.
    
    4. HEALTH AND WELLNESS BENEFITS. Standard health benefits include full medical, dental, and vision insurance with premium costs covered 85% by the company. Globex also sponsors an annual wellness allowance of $1,200 for gym memberships, fitness trackers, or mental wellness apps.
    
    5. PROFESSIONAL DEVELOPMENT. We believe in lifelong learning. Globex offers up to $3,000 yearly in tuition reimbursement for approved courses, certifications, and technical conferences. Prior approval from the Learning and Development committee is mandatory.`,
  },
  {
    filename: "Cloud_Server_Architecture.md",
    source: "DevOps Wiki",
    title: "Cloud Infrastructure Architecture & Scaling Policies",
    text: `# CLOUD SERVERS OVERVIEW & TECHNICAL SPECIFICATION.
    
    This document outlines the system architecture for our containerized Cloud Run deployments.
    
    1. NETWORK INGRESS AND INTERNET ROUTING. All client traffic hits our Google Cloud Load Balancer (GCLB) which handles TLS termination. The load balancer forwards traffic to our Nginx reverse proxy running on container port 3000. Port 3000 is the ONLY externally accessible port in this infrastructure. Any services attempting to bind to other ports (e.g. 3001, 5173) will fail container health checks and be killed immediately.
    
    2. DISK PERSISTENCE AND MEMORY LIMITS. Our cloud containers are fully stateless. Ephemeral storage is allocated up to 10GB but is wiped on container recycling. For durable state, the system connects directly to Cloud SQL PostgreSQL and Firebase Firestore.
    
    3. AUTO-SCALING TRIGGERS. Containers are configured to scale horizontally based on target CPU utilization of 70% or active concurrent requests exceeding 80 per container. Scale-to-zero is enabled to reduce idle cloud expenditures; containers scale down to 0 instances when no requests are processed for 15 consecutive minutes.
    
    4. DATA REDUNDANCY. Database failovers are automated. Our Cloud SQL PostgreSQL database runs in High Availability (HA) mode with active-passive replication across US-East1 and US-East4. Read replicas are automatically provisioned to serve high-volume analytical workloads.`,
  },
  {
    filename: "Customer_Support_FAQ.docx",
    source: "Intercom Knowledgebase",
    title: "Customer Support SOP & FAQs",
    text: `CUSTOMER SERVICE STANDARD OPERATING PROCEDURES (SOP)
    
    This SOP outlines customer support standards, tier escalations, and payment refund terms.
    
    1. SERVICE LEVEL AGREEMENT (SLA). First response time (FRT) for Tier 1 customer queries must be kept under 2 hours. High-priority Enterprise customer queries have an SLA limit of 15 minutes. Custom dashboards track live SLA breach metrics in real-time.
    
    2. REFUND AND CANCELATION POLICIES. Customers can cancel any subscription plan within 14 days of purchase for a 100% full money-back guarantee. No refunds are issued after the 14-day grace period. Subscriptions canceled mid-cycle remain active until the end of the current billing term.
    
    3. ESCALATION PROTOCOLS. 
    - Tier 1: General inquiries, password resets, and simple navigation support. Managed by frontend support team.
    - Tier 2: Billing disputes, complex API bugs, and account modifications. Escalated to billing and technical specialists.
    - Tier 3: Core database corruption, server downtime, and security concerns. Escalated directly to DevOps on-call engineers.
    
    4. API TOKEN ROTATION. If a customer reports a compromised API token, support staff must immediately revoke the token via the Admin Console and trigger an automated email to the customer with secure link to generate a replacement token.`,
  },
];

/**
 * Handles processing and ingestion of a document.
 * Calls Semantic Chunking, generates Embeddings in batch, and stores them in the Vector Store.
 */
export async function ingestDocument(
  filename: string,
  source: string,
  text: string,
  options: { thresholdPercentile?: number } = {}
): Promise<{ chunksCount: number; durationMs: number }> {
  const startTime = Date.now();
  addLog("Ingestion", "INFO", `Beginning ingestion of document: ${filename} (${text.length} chars)`);

  try {
    // 1. Semantic Chunking
    addLog("Chunking", "INFO", `Splitting document into semantic boundaries using percentile ${options.thresholdPercentile ?? 80}...`);
    const { chunks, visualData } = await performSemanticChunking(text, source, filename, {
      thresholdPercentile: options.thresholdPercentile,
    });
    
    if (chunks.length === 0) {
      throw new Error("Document yielded 0 semantic chunks. Ensure document contains valid text.");
    }
    addLog("Chunking", "SUCCESS", `Successfully extracted ${chunks.length} semantic chunks from text.`);

    // 2. Embedding Generation
    addLog("Embeddings", "INFO", `Generating high-dimensional embeddings for ${chunks.length} chunks via Gemini...`);
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    addLog("Embeddings", "SUCCESS", `Successfully computed ${embeddings.length} dense vector representations.`);

    // 3. Vector Database Storage (Local Persistent Store)
    addLog("VectorStore", "INFO", `Syncing chunks and vector indexes to local disk persistence...`);
    vectorStore.addItems(chunks, embeddings);
    addLog("VectorStore", "SUCCESS", `Durable index committed. ${chunks.length} nodes successfully added.`);

    const durationMs = Date.now() - startTime;
    addLog("Ingestion", "SUCCESS", `Ingestion finalized for ${filename} in ${durationMs}ms.`);

    return {
      chunksCount: chunks.length,
      durationMs,
    };
  } catch (error: any) {
    addLog("Ingestion", "ERROR", `Ingestion failed: ${error.message || error}`);
    throw error;
  }
}

/**
 * Seed initial datasets on startup so the app is immediately ready.
 */
export async function seedPreloadedDatasets() {
  addLog("System", "INFO", "Seeding initial system database with professional knowledge bases...");
  for (const doc of PRELOADED_DATASETS) {
    try {
      await ingestDocument(doc.filename, doc.source, doc.text, { thresholdPercentile: 75 });
    } catch (err) {
      console.error(`Failed to seed ${doc.filename}:`, err);
    }
  }
  addLog("System", "SUCCESS", "Seeding completed. RAG Pipeline fully primed.");
}
