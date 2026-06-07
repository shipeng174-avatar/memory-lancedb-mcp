#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { loadCanonicalCorpus } from "./corpus.js";
import { extractMemories } from "./extraction.js";
import { loadSessionTranscripts } from "./sessions.js";
import { MemoryStore } from "./store.js";

const categorySchema = z.enum(["profile", "preference", "entity", "event", "case", "pattern", "note"]);
const retrievalModeSchema = z.enum(["vector", "keyword", "hybrid"]);
const metadataSchema = z.record(z.unknown()).default({});

const store = new MemoryStore();
const server = new McpServer({
  name: "memory-lancedb-mcp",
  version: "0.1.0"
});

server.tool(
  "memory_store",
  "Store a durable memory in LanceDB using SiliconFlow/OpenAI-compatible embeddings.",
  {
    text: z.string().min(1),
    scope: z.string().optional().default(config.memory.defaultScope),
    userId: z.string().optional(),
    projectId: z.string().optional(),
    agentId: z.string().optional(),
    category: categorySchema.optional().default("note"),
    importance: z.number().min(0).max(1).optional().default(0.5),
    source: z.string().optional().default("manual"),
    tags: z.array(z.string()).optional().default([]),
    metadata: metadataSchema
  },
  async (input) => {
    const record = await store.store(input);
    return jsonResult(record);
  }
);

server.tool(
  "memory_recall",
  "Recall semantically relevant memories by scope, category, tags, and optional isolation keys.",
  {
    query: z.string().min(1),
    scope: z.string().optional().default(config.memory.defaultScope),
    userId: z.string().optional(),
    projectId: z.string().optional(),
    agentId: z.string().optional(),
    categories: z.array(categorySchema).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).optional().default(config.memory.defaultLimit),
    mode: retrievalModeSchema.optional().default(config.memory.retrievalMode),
    minScore: z.number().min(0).max(1).optional().default(config.memory.minScore)
  },
  async (input) => {
    const results = await store.recall(input);
    return jsonResult({ results });
  }
);

server.tool(
  "memory_forget",
  "Delete a memory by id, or delete top query matches within a scope.",
  {
    id: z.string().optional(),
    query: z.string().optional(),
    scope: z.string().optional().default(config.memory.defaultScope)
  },
  async (input) => {
    const result = await store.forget(input.id, input.query, input.scope);
    return jsonResult(result);
  }
);

server.tool(
  "memory_update",
  "Update an existing memory and refresh its embedding when text changes.",
  {
    id: z.string().min(1),
    text: z.string().min(1).optional(),
    userId: z.string().optional(),
    projectId: z.string().optional(),
    agentId: z.string().optional(),
    category: categorySchema.optional(),
    importance: z.number().min(0).max(1).optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: metadataSchema.optional()
  },
  async (input) => {
    const record = await store.update(input);
    return jsonResult(record);
  }
);

server.tool(
  "memory_list",
  "List recent memories in a scope.",
  {
    scope: z.string().optional().default(config.memory.defaultScope),
    limit: z.number().int().min(1).max(200).optional().default(50)
  },
  async (input) => {
    const records = await store.list(input.scope, input.limit);
    return jsonResult({ records });
  }
);

server.tool(
  "memory_extract",
  "Extract durable categorized memories from conversation text, optionally storing them immediately.",
  {
    text: z.string().min(1),
    scope: z.string().optional().default(config.memory.defaultScope),
    userId: z.string().optional(),
    projectId: z.string().optional(),
    agentId: z.string().optional(),
    source: z.string().optional().default("smart-extraction"),
    maxMemories: z.number().int().min(1).max(20).optional().default(8),
    minImportance: z.number().min(0).max(1).optional().default(config.extraction.minImportance),
    store: z.boolean().optional().default(true)
  },
  async (input) => {
    const memories = await extractMemories({
      text: input.text,
      source: input.source,
      maxMemories: input.maxMemories,
      minImportance: input.minImportance
    });

    if (!input.store) {
      return jsonResult({ memories, stored: [] });
    }

    const stored = await store.storeMany(
      memories.map((memory) => ({
        ...memory,
        scope: input.scope,
        userId: input.userId,
        projectId: input.projectId,
        agentId: input.agentId,
        source: memory.source ?? input.source
      }))
    );

    return jsonResult({ memories, stored: stored.records });
  }
);

server.tool("memory_stats", "Show memory database statistics and active configuration.", {}, async () => {
  const stats = await store.stats();
  return jsonResult(stats);
});

server.tool(
  "memory_export",
  "Export memories as JSON, optionally filtered by scope and written to a local file.",
  {
    scope: z.string().optional(),
    outputPath: z.string().optional()
  },
  async (input) => {
    const result = await store.export(input);
    return jsonResult(result);
  }
);

server.tool(
  "memory_import",
  "Import memories from JSON text or a local JSON export file.",
  {
    json: z.string().optional(),
    inputPath: z.string().optional(),
    scope: z.string().optional()
  },
  async (input) => {
    const result = await store.importMemories(input);
    return jsonResult(result);
  }
);

server.tool(
  "memory_index_corpus",
  "Index canonical memory files such as MEMORY.md and memory/**/*.md into LanceDB with path citations.",
  {
    root: z.string().optional().default(config.canonicalCorpus.root),
    scope: z.string().optional().default(config.memory.defaultScope),
    maxChars: z.number().int().min(400).max(8000).optional().default(config.canonicalCorpus.maxChars)
  },
  async (input) => {
    const chunks = await loadCanonicalCorpus(input);
    const stored = await store.indexCorpus(chunks, input.scope);
    return jsonResult({
      indexed: stored.records.length,
      chunks,
      records: stored.records
    });
  }
);

server.tool(
  "memory_index_sessions",
  "Index session transcript JSONL files into LanceDB with path citations.",
  {
    root: z.string().optional().default(config.sessionTranscripts.root),
    scope: z.string().optional().default(config.memory.defaultScope),
    maxChars: z.number().int().min(400).max(10000).optional().default(config.sessionTranscripts.maxChars)
  },
  async (input) => {
    const chunks = await loadSessionTranscripts(input);
    const stored = await store.indexSessions(chunks, input.scope);
    return jsonResult({
      indexed: stored.records.length,
      chunks,
      records: stored.records
    });
  }
);

server.tool(
  "memory_decay_preview",
  "Preview low-value memories that would be pruned by the decay model.",
  {
    scope: z.string().optional().default(config.memory.defaultScope),
    threshold: z.number().min(0).max(1).optional().default(config.decay.pruneScoreThreshold),
    minAgeDays: z.number().min(0).optional().default(config.decay.pruneMinAgeDays)
  },
  async (input) => {
    const candidates = await store.decayPreview(input.scope, input.threshold, input.minAgeDays);
    return jsonResult({ candidates });
  }
);

server.tool(
  "memory_prune",
  "Prune low-value memories selected by the decay model. Defaults to dry run.",
  {
    scope: z.string().optional().default(config.memory.defaultScope),
    threshold: z.number().min(0).max(1).optional().default(config.decay.pruneScoreThreshold),
    minAgeDays: z.number().min(0).optional().default(config.decay.pruneMinAgeDays),
    dryRun: z.boolean().optional().default(true)
  },
  async (input) => {
    const result = await store.prune(input.scope, input.threshold, input.minAgeDays, input.dryRun);
    return jsonResult(result);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
