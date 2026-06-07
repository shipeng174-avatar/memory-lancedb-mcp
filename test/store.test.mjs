import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("indexCorpus is idempotent for the same source chunk", async () => {
  process.env.EMBEDDING_PROVIDER = "mock";
  process.env.LANCEDB_PATH = await mkdtemp(path.join(os.tmpdir(), "memory-lancedb-mcp-"));
  process.env.LANCEDB_TABLE = "memories";

  const { MemoryStore } = await import(`../dist/store.js?case=${Date.now()}`);
  const store = new MemoryStore();
  const chunk = {
    text: "The user prefers SiliconFlow embeddings.",
    path: "MEMORY.md",
    startLine: 1,
    endLine: 2,
    citation: "MEMORY.md:1-2"
  };

  try {
    const first = await store.indexCorpus([chunk], "global");
    const second = await store.indexCorpus([chunk], "global");
    const listed = await store.list("global", 10);

    assert.equal(first.inserted, 1);
    assert.equal(first.replaced, 0);
    assert.equal(second.inserted, 0);
    assert.equal(second.replaced, 1);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].metadata.citation, "MEMORY.md:1-2");
  } finally {
    await rm(process.env.LANCEDB_PATH, { recursive: true, force: true });
  }
});

test("store redacts secrets before writing to LanceDB", async () => {
  process.env.EMBEDDING_PROVIDER = "mock";
  process.env.REDACT_SECRETS = "true";
  process.env.LANCEDB_PATH = await mkdtemp(path.join(os.tmpdir(), "memory-lancedb-mcp-"));
  process.env.LANCEDB_TABLE = "memories";

  const { MemoryStore } = await import(`../dist/store.js?case=${Date.now()}-redact`);
  const store = new MemoryStore();

  try {
    await store.store({
      text: "Use api_key=sk_abcdefghijklmnopqrstuvwxyz123456 for testing.",
      metadata: {
        token: "Bearer abcdefghijklmnopqrstuvwxyz123456"
      }
    });

    const [record] = await store.list("global", 10);
    assert.equal(record.text.includes("sk_"), false);
    assert.equal(record.text.includes("[REDACTED_SECRET]"), true);
    assert.equal(record.metadata.token, "[REDACTED_SECRET]");
  } finally {
    await rm(process.env.LANCEDB_PATH, { recursive: true, force: true });
  }
});
