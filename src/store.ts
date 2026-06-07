import * as lancedb from "@lancedb/lancedb";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { embedText } from "./embedding.js";
import { maybeRerank } from "./rerank.js";
import { redactMetadataSecrets, redactSecrets } from "./safety.js";
import { bm25KeywordScores, cosineSimilarity, memoryDecayScore, recordAgeDays, toRecallResult } from "./scoring.js";
import type { CorpusChunk, MemoryCategory, MemoryRecord, RecallOptions, RecallResult, SessionChunk } from "./types.js";

type LanceConnection = Awaited<ReturnType<typeof lancedb.connect>>;
type LanceTable = Awaited<ReturnType<LanceConnection["openTable"]>>;

export interface StoreMemoryInput {
  id?: string;
  text: string;
  scope?: string;
  userId?: string;
  projectId?: string;
  agentId?: string;
  category?: MemoryCategory;
  importance?: number;
  source?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface StoreManyResult {
  records: MemoryRecord[];
  inserted: number;
  replaced: number;
}

export interface UpdateMemoryInput extends Partial<Omit<StoreMemoryInput, "scope">> {
  id: string;
}

export interface ExportOptions {
  scope?: string;
  outputPath?: string;
}

export interface ImportOptions {
  json?: string;
  inputPath?: string;
  scope?: string;
}

export interface DecayCandidate {
  id: string;
  text: string;
  scope: string;
  category: MemoryCategory;
  importance: number;
  decayScore: number;
  ageDays: number;
  lastAccessedAt?: string;
  createdAt: string;
}

export class MemoryStore {
  private db?: LanceConnection;
  private table?: LanceTable;

  async store(input: StoreMemoryInput): Promise<MemoryRecord> {
    const record = await this.buildRecord(input);
    await this.upsertRecords([record]);
    return record;
  }

  async storeMany(inputs: StoreMemoryInput[]): Promise<StoreManyResult> {
    const records: MemoryRecord[] = [];
    for (const input of inputs) {
      records.push(await this.buildRecord(input));
    }

    const result = await this.upsertRecords(records);
    return { records, ...result };
  }

  async indexCorpus(chunks: CorpusChunk[], scope = config.memory.defaultScope): Promise<StoreManyResult> {
    return this.storeMany(
      chunks.map((chunk) => ({
        id: stableMemoryId("canonical-corpus", scope, chunk.path, String(chunk.startLine), String(chunk.endLine)),
        text: chunk.text,
        scope,
        category: "note",
        importance: 0.65,
        source: "canonical-corpus",
        tags: ["canonical", "memory-md"],
        metadata: {
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          citation: chunk.citation
        }
      }))
    );
  }

  async indexSessions(chunks: SessionChunk[], scope = config.memory.defaultScope): Promise<StoreManyResult> {
    return this.storeMany(
      chunks.map((chunk) => ({
        id: stableMemoryId("sessions", scope, chunk.path, String(chunk.startLine), String(chunk.endLine), chunk.sessionId ?? ""),
        text: chunk.text,
        scope,
        category: "event",
        importance: 0.45,
        source: "sessions",
        tags: ["session", "transcript"],
        metadata: {
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          citation: chunk.citation,
          sessionId: chunk.sessionId
        }
      }))
    );
  }

  async recall(options: RecallOptions): Promise<RecallResult[]> {
    const queryVector = options.mode === "keyword" ? undefined : await embedText(options.query);
    const records = await this.records();
    const scoped = records.filter((record) => this.matchesFilters(record, options));
    const mode = options.mode ?? config.memory.retrievalMode;
    const minScore = options.minScore ?? config.memory.minScore;
    const keywordScores = bm25KeywordScores(options.query, scoped);

    const scored = scoped
      .map((record) => {
        const vectorScore = queryVector ? normalizeCosine(cosineSimilarity(queryVector, record.vector)) : 0;
        const textScore = keywordScores.get(record.id) ?? 0;
        const score =
          mode === "vector"
            ? vectorScore
            : mode === "keyword"
              ? textScore
              : vectorScore * config.memory.vectorWeight + textScore * config.memory.bm25Weight;

        const decayScore = config.decay.enabled ? memoryDecayScore(record) : 1;
        const finalScore = applyDecay(applyImportance(score, record.importance), decayScore);
        return toRecallResult(record, finalScore, vectorScore, textScore, decayScore);
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(options.limit ?? config.memory.defaultLimit, 1));

    const reranked = await maybeRerank(options.query, scored);
    await this.markAccessed(reranked.map((item) => item.id));
    return reranked;
  }

  private async buildRecord(input: StoreMemoryInput): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    const text = config.safety.redactSecrets ? redactSecrets(input.text) : input.text;
    const metadata = config.safety.redactSecrets
      ? redactMetadataSecrets(input.metadata ?? {})
      : input.metadata ?? {};

    return {
      id: input.id ?? uuidv4(),
      text,
      vector: await embedText(text),
      scope: input.scope ?? config.memory.defaultScope,
      userId: input.userId,
      projectId: input.projectId,
      agentId: input.agentId,
      category: input.category ?? "note",
      importance: clamp(input.importance ?? 0.5, 0, 1),
      source: input.source ?? "manual",
      tags: input.tags ?? [],
      metadata,
      createdAt: now,
      updatedAt: now,
      accessCount: 0
    };
  }

  async list(scope = config.memory.defaultScope, limit = 50): Promise<MemoryRecord[]> {
    const records = await this.records();
    return records
      .filter((record) => record.scope === scope)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(limit, 1));
  }

  async forget(id?: string, query?: string, scope = config.memory.defaultScope): Promise<{ deleted: number; ids: string[] }> {
    if (!id && !query) {
      throw new Error("Either id or query is required.");
    }

    const records = await this.records();
    const ids = id
      ? [id]
      : (await this.recall({ query: query ?? "", scope, limit: 10, mode: "hybrid" })).map((result) => result.id);

    const keep = records.filter((record) => !ids.includes(record.id));
    await this.replaceAll(keep);

    return { deleted: records.length - keep.length, ids };
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    const records = await this.records();
    const index = records.findIndex((record) => record.id === input.id);
    if (index === -1) {
      throw new Error(`Memory not found: ${input.id}`);
    }

    const current = records[index];
    const text = input.text ?? current.text;
    const updated: MemoryRecord = {
      ...current,
      text,
      vector: input.text ? await embedText(text) : current.vector,
      userId: input.userId ?? current.userId,
      projectId: input.projectId ?? current.projectId,
      agentId: input.agentId ?? current.agentId,
      category: input.category ?? current.category,
      importance: input.importance === undefined ? current.importance : clamp(input.importance, 0, 1),
      source: input.source ?? current.source,
      tags: input.tags ?? current.tags,
      metadata: input.metadata ?? current.metadata,
      updatedAt: new Date().toISOString()
    };

    records[index] = updated;
    await this.replaceAll(records);
    return updated;
  }

  async stats(): Promise<Record<string, unknown>> {
    const records = await this.records();
    const byScope = countBy(records, (record) => record.scope);
    const byCategory = countBy(records, (record) => record.category);

    return {
      total: records.length,
      byScope,
      byCategory,
      databasePath: config.lancedb.path,
      table: config.lancedb.table,
      embeddingModel: config.embedding.model,
      retrievalMode: config.memory.retrievalMode,
      rerankEnabled: config.rerank.enabled
    };
  }

  async export(options: ExportOptions = {}): Promise<{ records: MemoryRecord[]; outputPath?: string }> {
    const records = await this.records();
    const scoped = options.scope ? records.filter((record) => record.scope === options.scope) : records;

    if (options.outputPath) {
      await writeFile(
        options.outputPath,
        JSON.stringify(
          {
            format: "memory-lancedb-mcp.export.v1",
            exportedAt: new Date().toISOString(),
            records: scoped
          },
          null,
          2
        ),
        "utf8"
      );
    }

    return { records: scoped, outputPath: options.outputPath };
  }

  async importMemories(options: ImportOptions): Promise<{ imported: number; skipped: number; records: MemoryRecord[] }> {
    const raw = options.json ?? (options.inputPath ? await readFile(options.inputPath, "utf8") : undefined);
    if (!raw) {
      throw new Error("Either json or inputPath is required.");
    }

    const parsed = JSON.parse(raw) as unknown;
    const incoming = parseImportRecords(parsed);
    const existing = await this.records();
    const existingIds = new Set(existing.map((record) => record.id));
    const now = new Date().toISOString();
    const imported: MemoryRecord[] = [];
    let skipped = 0;

    for (const record of incoming) {
      if (existingIds.has(record.id)) {
        skipped += 1;
        continue;
      }

      imported.push({
        ...record,
        scope: options.scope ?? record.scope ?? config.memory.defaultScope,
        createdAt: record.createdAt ?? now,
        updatedAt: now,
        accessCount: Number(record.accessCount ?? 0),
        vector: record.vector?.length ? record.vector : await embedText(record.text)
      });
    }

    await this.addRecords(imported);
    return { imported: imported.length, skipped, records: imported };
  }

  async decayPreview(
    scope = config.memory.defaultScope,
    threshold = config.decay.pruneScoreThreshold,
    minAgeDays = config.decay.pruneMinAgeDays
  ): Promise<DecayCandidate[]> {
    const records = await this.records();
    return records
      .filter((record) => record.scope === scope)
      .map((record) => ({
        id: record.id,
        text: record.text,
        scope: record.scope,
        category: record.category,
        importance: record.importance,
        decayScore: memoryDecayScore(record),
        ageDays: recordAgeDays(record),
        lastAccessedAt: record.lastAccessedAt,
        createdAt: record.createdAt
      }))
      .filter((candidate) => candidate.decayScore <= threshold && candidate.ageDays >= minAgeDays)
      .sort((left, right) => left.decayScore - right.decayScore);
  }

  async prune(
    scope = config.memory.defaultScope,
    threshold = config.decay.pruneScoreThreshold,
    minAgeDays = config.decay.pruneMinAgeDays,
    dryRun = true
  ): Promise<{ deleted: number; candidates: DecayCandidate[] }> {
    const candidates = await this.decayPreview(scope, threshold, minAgeDays);
    if (dryRun || !candidates.length) {
      return { deleted: 0, candidates };
    }

    const ids = new Set(candidates.map((candidate) => candidate.id));
    const records = await this.records();
    await this.replaceAll(records.filter((record) => !ids.has(record.id)));
    return { deleted: candidates.length, candidates };
  }

  private async getConnection(): Promise<LanceConnection> {
    if (this.db) {
      return this.db;
    }

    await mkdir(config.lancedb.path, { recursive: true });
    this.db = await lancedb.connect(config.lancedb.path);
    return this.db;
  }

  private async getTable(): Promise<LanceTable | undefined> {
    if (this.table) {
      return this.table;
    }

    const db = await this.getConnection();

    try {
      this.table = await db.openTable(config.lancedb.table);
    } catch {
      return undefined;
    }

    return this.table;
  }

  private async addRecords(records: MemoryRecord[]): Promise<void> {
    if (!records.length) {
      return;
    }

    const table = await this.getTable();
    if (!table) {
      const db = await this.getConnection();
      this.table = await db.createTable(config.lancedb.table, toLanceRows(records));
      return;
    }

    await table.add(toLanceRows(records));
  }

  private async upsertRecords(records: MemoryRecord[]): Promise<{ inserted: number; replaced: number }> {
    if (!records.length) {
      return { inserted: 0, replaced: 0 };
    }

    const existing = await this.records();
    const incomingById = new Map(records.map((record) => [record.id, record]));
    const merged: MemoryRecord[] = [];
    let replaced = 0;

    for (const record of existing) {
      const incoming = incomingById.get(record.id);
      if (incoming) {
        merged.push({
          ...incoming,
          createdAt: record.createdAt,
          accessCount: record.accessCount,
          lastAccessedAt: record.lastAccessedAt
        });
        incomingById.delete(record.id);
        replaced += 1;
      } else {
        merged.push(record);
      }
    }

    const inserted = incomingById.size;
    merged.push(...incomingById.values());
    await this.replaceAll(merged);
    return { inserted, replaced };
  }

  private async records(): Promise<MemoryRecord[]> {
    const table = await this.getTable();
    if (!table) {
      return [];
    }

    const rows = (await table.query().limit(100000).toArray()) as unknown[];
    return rows.map(normalizeRecord).filter((record): record is MemoryRecord => Boolean(record));
  }

  private async replaceAll(records: MemoryRecord[]): Promise<void> {
    const table = await this.getTable();
    if (!table) {
      if (records.length) {
        await this.addRecords(records);
      }
      return;
    }

    await table.delete("id IS NOT NULL");
    if (records.length) {
      await table.add(toLanceRows(records));
    }
  }

  private async markAccessed(ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }

    const records = await this.records();
    const now = new Date().toISOString();
    const updated = records.map((record) =>
      ids.includes(record.id)
        ? {
            ...record,
            lastAccessedAt: now,
            accessCount: record.accessCount + 1
          }
        : record
    );
    await this.replaceAll(updated);
  }

  private matchesFilters(record: MemoryRecord, options: RecallOptions): boolean {
    if (record.scope !== (options.scope ?? config.memory.defaultScope)) {
      return false;
    }

    if (options.userId && record.userId !== options.userId) {
      return false;
    }

    if (options.projectId && record.projectId !== options.projectId) {
      return false;
    }

    if (options.agentId && record.agentId !== options.agentId) {
      return false;
    }

    if (options.categories?.length && !options.categories.includes(record.category)) {
      return false;
    }

    if (options.tags?.length && !options.tags.every((tag) => record.tags.includes(tag))) {
      return false;
    }

    return true;
  }
}

function normalizeRecord(row: unknown): MemoryRecord | undefined {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  const record = row as MemoryRecord;
  const vector = normalizeVector((record as { vector?: unknown }).vector);
  if (!record.id || !record.text || !vector.length) {
    return undefined;
  }

  return {
    ...record,
    vector,
    tags: normalizeStringArray((record as { tags?: unknown }).tags),
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
    accessCount: Number(record.accessCount ?? 0)
  };
}

function normalizeVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number);
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as Iterable<number>, Number);
  }

  if (isVectorLike(value)) {
    return Array.from({ length: value.length }, (_, index) => Number(value.get(index)));
  }

  return [];
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(isRealTag);
  }

  if (isVectorLike(value)) {
    return Array.from({ length: value.length }, (_, index) => value.get(index)).filter(isRealTag);
  }

  return [];
}

function isRealTag(item: unknown): item is string {
  return typeof item === "string" && item !== "__none__";
}

function isVectorLike(value: unknown): value is { length: number; get: (index: number) => unknown } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { length?: unknown }).length === "number" &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function normalizeCosine(value: number): number {
  return (value + 1) / 2;
}

function applyImportance(score: number, importance: number): number {
  return score * 0.85 + importance * 0.15;
}

function applyDecay(score: number, decayScore: number): number {
  if (!config.decay.enabled) {
    return score;
  }

  return score * (0.7 + decayScore * 0.3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function parseImportRecords(parsed: unknown): MemoryRecord[] {
  const maybeRecords =
    parsed && typeof parsed === "object" && "records" in parsed
      ? (parsed as { records?: unknown }).records
      : parsed;

  if (!Array.isArray(maybeRecords)) {
    throw new Error("Import data must be an array or an object with a records array.");
  }

  return maybeRecords
    .map((item): MemoryRecord | undefined => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const record = item as Partial<MemoryRecord>;
      if (!record.id || !record.text) {
        return undefined;
      }

      return {
        id: record.id,
        text: record.text,
        vector: Array.isArray(record.vector) ? record.vector : [],
        scope: record.scope ?? config.memory.defaultScope,
        userId: record.userId,
        projectId: record.projectId,
        agentId: record.agentId,
        category: record.category ?? "note",
        importance: typeof record.importance === "number" ? record.importance : 0.5,
        source: record.source ?? "import",
        tags: Array.isArray(record.tags) ? record.tags : [],
        metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
        createdAt: record.createdAt ?? new Date().toISOString(),
        updatedAt: record.updatedAt ?? new Date().toISOString(),
        lastAccessedAt: record.lastAccessedAt,
        accessCount: Number(record.accessCount ?? 0)
      };
    })
    .filter((record): record is MemoryRecord => Boolean(record));
}

function toLanceRows(records: MemoryRecord[]): Record<string, unknown>[] {
  return records.map((record) => {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) {
        row[key] = value;
      }
    }
    if (Array.isArray(row.tags) && row.tags.length === 0) {
      row.tags = ["__none__"];
    }
    return row;
  });
}

function stableMemoryId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}
