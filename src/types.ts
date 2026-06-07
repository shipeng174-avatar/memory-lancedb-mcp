import type { RetrievalMode } from "./config.js";

export type MemoryCategory =
  | "profile"
  | "preference"
  | "entity"
  | "event"
  | "case"
  | "pattern"
  | "note";

export interface MemoryRecord {
  id: string;
  text: string;
  vector: number[];
  scope: string;
  userId?: string;
  projectId?: string;
  agentId?: string;
  category: MemoryCategory;
  importance: number;
  source: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
}

export interface RecallOptions {
  query: string;
  scope?: string;
  userId?: string;
  projectId?: string;
  agentId?: string;
  categories?: MemoryCategory[];
  tags?: string[];
  limit?: number;
  mode?: RetrievalMode;
  minScore?: number;
}

export interface RecallResult {
  id: string;
  text: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  scope: string;
  category: MemoryCategory;
  importance: number;
  source: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  decayScore?: number;
}

export interface ExtractedMemory {
  text: string;
  category: MemoryCategory;
  importance: number;
  source?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface CorpusChunk {
  text: string;
  path: string;
  startLine: number;
  endLine: number;
  citation: string;
}

export interface SessionChunk extends CorpusChunk {
  sessionId?: string;
}
