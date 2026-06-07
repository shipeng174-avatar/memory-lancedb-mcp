import assert from "node:assert/strict";
import test from "node:test";
import {
  bm25KeywordScores,
  cosineSimilarity,
  keywordScore,
  memoryDecayScore,
  recordAgeDays,
  toRecallResult
} from "../dist/scoring.js";

function memory(overrides = {}) {
  const now = new Date("2026-06-07T00:00:00.000Z").toISOString();
  return {
    id: "mem-1",
    text: "Use SiliconFlow BAAI/bge-m3 for embeddings.",
    vector: [1, 0, 0],
    scope: "global",
    category: "preference",
    importance: 0.8,
    source: "test",
    tags: ["embedding", "siliconflow"],
    metadata: {},
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    ...overrides
  };
}

test("cosineSimilarity scores identical and orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("keywordScore matches query terms across text and tags", () => {
  const score = keywordScore("siliconflow embedding", "Use bge-m3.", ["embedding", "siliconflow"]);
  assert.equal(score, 1);
});

test("bm25KeywordScores rewards the most relevant memory", () => {
  const records = [
    memory({ id: "a", text: "SiliconFlow bge-m3 embedding provider.", tags: ["embedding"] }),
    memory({ id: "b", text: "Use PostgreSQL for relational data.", tags: ["database"] })
  ];
  const scores = bm25KeywordScores("siliconflow embedding", records);

  assert.ok((scores.get("a") ?? 0) > (scores.get("b") ?? 0));
  assert.equal(scores.get("a"), 1);
});

test("memoryDecayScore rewards importance and recent access", () => {
  const now = new Date("2026-06-07T00:00:00.000Z");
  const freshImportant = memory({ importance: 0.9, accessCount: 5 });
  const oldUnimportant = memory({
    importance: 0.05,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    lastAccessedAt: "2025-01-01T00:00:00.000Z"
  });

  assert.ok(memoryDecayScore(freshImportant, now) > memoryDecayScore(oldUnimportant, now));
  assert.ok(recordAgeDays(oldUnimportant, now) > 500);
});

test("toRecallResult includes metadata and optional decay score", () => {
  const result = toRecallResult(memory(), 0.72, 0.8, 0.6, 0.9);
  assert.equal(result.id, "mem-1");
  assert.equal(result.score, 0.72);
  assert.equal(result.vectorScore, 0.8);
  assert.equal(result.keywordScore, 0.6);
  assert.equal(result.decayScore, 0.9);
  assert.deepEqual(result.tags, ["embedding", "siliconflow"]);
});
