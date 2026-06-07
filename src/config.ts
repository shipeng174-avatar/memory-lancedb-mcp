import "dotenv/config";
import path from "node:path";

export type RetrievalMode = "vector" | "keyword" | "hybrid";

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const config = {
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER ?? "openai-compatible",
    apiKey: process.env.SILICONFLOW_API_KEY ?? process.env.EMBEDDING_API_KEY ?? "",
    baseUrl: normalizeBaseUrl(process.env.EMBEDDING_BASE_URL ?? "https://api.siliconflow.cn/v1"),
    model: process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3"
  },
  rerank: {
    enabled: boolFromEnv("RERANK_ENABLED", false),
    apiKey: process.env.RERANK_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? "",
    baseUrl: normalizeBaseUrl(process.env.RERANK_BASE_URL ?? "https://api.siliconflow.cn/v1"),
    model: process.env.RERANK_MODEL ?? "BAAI/bge-reranker-v2-m3"
  },
  extraction: {
    enabled: boolFromEnv("EXTRACTION_ENABLED", true),
    apiKey: process.env.EXTRACTION_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? "",
    baseUrl: normalizeBaseUrl(process.env.EXTRACTION_BASE_URL ?? "https://api.siliconflow.cn/v1"),
    model: process.env.EXTRACTION_MODEL ?? "Qwen/Qwen2.5-7B-Instruct",
    minImportance: numberFromEnv("EXTRACTION_MIN_IMPORTANCE", 0.35)
  },
  canonicalCorpus: {
    enabled: boolFromEnv("CANONICAL_CORPUS_ENABLED", true),
    root: path.resolve(process.env.CANONICAL_ROOT ?? "."),
    maxChars: Math.max(400, numberFromEnv("CANONICAL_MAX_CHARS", 1800))
  },
  sessionTranscripts: {
    enabled: boolFromEnv("SESSION_TRANSCRIPTS_ENABLED", true),
    root: path.resolve(process.env.SESSION_TRANSCRIPTS_ROOT ?? "."),
    maxChars: Math.max(400, numberFromEnv("SESSION_MAX_CHARS", 2200))
  },
  decay: {
    enabled: boolFromEnv("DECAY_ENABLED", true),
    halfLifeDays: Math.max(1, numberFromEnv("DECAY_HALF_LIFE_DAYS", 90)),
    importanceWeight: numberFromEnv("DECAY_IMPORTANCE_WEIGHT", 0.65),
    accessWeight: numberFromEnv("DECAY_ACCESS_WEIGHT", 0.2),
    pruneScoreThreshold: numberFromEnv("PRUNE_SCORE_THRESHOLD", 0.12),
    pruneMinAgeDays: Math.max(0, numberFromEnv("PRUNE_MIN_AGE_DAYS", 30))
  },
  safety: {
    redactSecrets: boolFromEnv("REDACT_SECRETS", true)
  },
  lancedb: {
    path: path.resolve(process.env.LANCEDB_PATH ?? "./memory-data/lancedb"),
    table: process.env.LANCEDB_TABLE ?? "memories"
  },
  memory: {
    defaultScope: process.env.DEFAULT_SCOPE ?? "global",
    defaultLimit: Math.max(1, numberFromEnv("DEFAULT_LIMIT", 8)),
    retrievalMode: (process.env.RETRIEVAL_MODE ?? "hybrid") as RetrievalMode,
    vectorWeight: numberFromEnv("VECTOR_WEIGHT", 0.7),
    bm25Weight: numberFromEnv("BM25_WEIGHT", 0.3),
    minScore: numberFromEnv("MIN_SCORE", 0)
  }
};

export function requireEmbeddingApiKey(): void {
  if (!config.embedding.apiKey) {
    throw new Error("Missing SILICONFLOW_API_KEY or EMBEDDING_API_KEY.");
  }
}
