import type { MemoryRecord, RecallResult } from "./types.js";

const bm25K1 = 1.5;
const bm25B = 0.75;

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function keywordScore(query: string, text: string, tags: string[]): number {
  const terms = tokenize(query);
  if (!terms.length) {
    return 0;
  }

  const searchable = tokenize(`${text} ${tags.join(" ")}`);
  if (!searchable.length) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const token of searchable) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  let matched = 0;
  for (const term of terms) {
    matched += Math.min(1, frequencies.get(term) ?? 0);
  }

  return matched / terms.length;
}

export function bm25KeywordScores(query: string, records: MemoryRecord[]): Map<string, number> {
  const queryTerms = tokenize(query);
  if (!queryTerms.length || !records.length) {
    return new Map(records.map((record) => [record.id, 0]));
  }

  const documents = records.map((record) => ({
    id: record.id,
    tokens: tokenize(`${record.text} ${record.tags.join(" ")}`)
  }));
  const averageLength = documents.reduce((sum, document) => sum + document.tokens.length, 0) / documents.length || 1;
  const documentFrequencies = new Map<string, number>();

  for (const term of new Set(queryTerms)) {
    let frequency = 0;
    for (const document of documents) {
      if (document.tokens.includes(term)) {
        frequency += 1;
      }
    }
    documentFrequencies.set(term, frequency);
  }

  const rawScores = new Map<string, number>();
  let maxScore = 0;

  for (const document of documents) {
    const termFrequencies = countTerms(document.tokens);
    let score = 0;

    for (const term of queryTerms) {
      const termFrequency = termFrequencies.get(term) ?? 0;
      if (termFrequency === 0) {
        continue;
      }

      const documentFrequency = documentFrequencies.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const denominator = termFrequency + bm25K1 * (1 - bm25B + bm25B * (document.tokens.length / averageLength));
      score += idf * ((termFrequency * (bm25K1 + 1)) / denominator);
    }

    rawScores.set(document.id, score);
    maxScore = Math.max(maxScore, score);
  }

  if (maxScore === 0) {
    return rawScores;
  }

  return new Map(Array.from(rawScores, ([id, score]) => [id, score / maxScore]));
}

export function memoryDecayScore(record: MemoryRecord, now = new Date()): number {
  const createdAt = Date.parse(record.createdAt);
  const lastAccessedAt = record.lastAccessedAt ? Date.parse(record.lastAccessedAt) : createdAt;
  const reference = Number.isFinite(lastAccessedAt) ? lastAccessedAt : Number.isFinite(createdAt) ? createdAt : now.getTime();
  const daysSinceReference = Math.max(0, (now.getTime() - reference) / 86_400_000);
  const halfLifeDays = Math.max(1, Number(process.env.DECAY_HALF_LIFE_DAYS ?? 90));
  const timeFactor = Math.pow(0.5, daysSinceReference / halfLifeDays);
  const importanceWeight = clamp(Number(process.env.DECAY_IMPORTANCE_WEIGHT ?? 0.65), 0, 1);
  const accessWeight = clamp(Number(process.env.DECAY_ACCESS_WEIGHT ?? 0.2), 0, 1);
  const accessBoost = Math.min(Math.log1p(record.accessCount) / 5, 1);

  return clamp(timeFactor * (1 - importanceWeight) + record.importance * importanceWeight + accessBoost * accessWeight, 0, 1);
}

export function recordAgeDays(record: MemoryRecord, now = new Date()): number {
  const createdAt = Date.parse(record.createdAt);
  const reference = Number.isFinite(createdAt) ? createdAt : now.getTime();
  return Math.max(0, (now.getTime() - reference) / 86_400_000);
}

export function toRecallResult(
  record: MemoryRecord,
  score: number,
  vectorScore?: number,
  textScore?: number,
  decayScore?: number
): RecallResult {
  return {
    id: record.id,
    text: record.text,
    score,
    vectorScore,
    keywordScore: textScore,
    scope: record.scope,
    category: record.category,
    importance: record.importance,
    source: record.source,
    tags: record.tags,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    decayScore
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
