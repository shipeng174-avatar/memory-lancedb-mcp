# Architecture

```text
MCP Client
  -> memory-lancedb-mcp
      -> SiliconFlow/OpenAI-compatible embeddings
      -> optional rerank provider
      -> LanceDB table
```

## Design Goals

- Keep the memory interface client-neutral by using MCP tools.
- Preserve the useful semantics of `memory-lancedb-pro`.
- Use LanceDB as the durable semantic index.
- Keep provider settings configurable instead of hard-coding SiliconFlow.
- Make OpenClacky integration simple: one MCP server entry and environment variables.

## Tool Surface

`memory_store` writes durable memories with category, importance, tags, metadata, source, and isolation keys.

`memory_recall` searches memories by query. It supports vector, keyword, and hybrid scoring modes.

`memory_forget` deletes by explicit id or by query match.

`memory_update` edits an existing memory and refreshes the embedding when text changes.

`memory_list` returns recent memories in a scope.

`memory_stats` returns counts and active configuration.

`memory_export` and `memory_import` provide JSON backup and migration flows, optionally scoped.

`memory_index_corpus` indexes canonical files from `MEMORY.md` and `memory/**/*.md`. The markdown files remain the source of truth; LanceDB stores semantic chunks with path, line span, and citation metadata.
Corpus chunk ids are deterministic from source, scope, path, and line span, so repeat indexing replaces old chunks instead of creating duplicates.

`memory_index_sessions` indexes `.jsonl` session transcripts. It stores chunks as `source: "sessions"` with path, line span, citation, and optional session id metadata.
Session chunk ids use the same deterministic strategy.

`memory_decay_preview` and `memory_prune` expose explicit maintenance for low-value memories. Recall scoring applies decay when enabled; deletion only happens when `memory_prune` is called with `dryRun: false`.

## Scope Model

Each memory has:

- `scope`
- `userId`
- `projectId`
- `agentId`

`scope` is required logically and defaults to `global`. The other keys are optional filters for clients that want stronger isolation.

## Retrieval

The current implementation loads candidate rows from LanceDB and scores them in process:

- vector score: cosine similarity over embedding vectors
- keyword score: simple token overlap
- hybrid score: weighted fusion

This keeps the first version portable and gives us a stable fallback for systems where native LanceDB vector search is unavailable. A later version can add native LanceDB ANN search for large collections.
