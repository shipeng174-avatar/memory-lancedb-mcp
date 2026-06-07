# OpenClacky Setup

OpenClacky loads MCP servers from:

- `~/.clacky/mcp.json`
- `<project>/.clacky/mcp.json`

The project config overrides the global config when both define the same server name.

## Recommended Project Config

Create `<project>/.clacky/mcp.json`:

```json
{
  "mcpServers": {
    "memory-lancedb": {
      "command": "npx",
      "args": ["-y", "memory-lancedb-mcp"],
      "description": "Long-term memory: store, recall, update, forget, and inspect LanceDB memories with SiliconFlow embeddings.",
      "env": {
        "SILICONFLOW_API_KEY": "your_key_here",
        "EMBEDDING_BASE_URL": "https://api.siliconflow.cn/v1",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "EXTRACTION_ENABLED": "true",
        "EXTRACTION_BASE_URL": "https://api.siliconflow.cn/v1",
        "EXTRACTION_MODEL": "Qwen/Qwen2.5-7B-Instruct",
        "CANONICAL_CORPUS_ENABLED": "true",
        "CANONICAL_ROOT": "C:/Users/czy58/Documents/api",
        "SESSION_TRANSCRIPTS_ENABLED": "true",
        "SESSION_TRANSCRIPTS_ROOT": "C:/Users/czy58/.openclacky/sessions",
        "DECAY_ENABLED": "true",
        "DECAY_HALF_LIFE_DAYS": "90",
        "LANCEDB_PATH": "C:/Users/czy58/.openclacky/memory/lancedb",
        "LANCEDB_TABLE": "memories",
        "DEFAULT_SCOPE": "global",
        "RETRIEVAL_MODE": "hybrid"
      }
    }
  }
}
```

Use absolute paths for data directories such as `LANCEDB_PATH`. If `npx` is not found by OpenClacky, install globally with `npm install -g memory-lancedb-mcp` and set `command` to `memory-lancedb-mcp`.

## Suggested Agent Behavior

OpenClacky treats MCP servers as virtual skills and loads full tool schemas on demand. For long-term memory, tell the agent to:

- Call `memory_recall` when starting a task, especially when preferences, previous decisions, or project context may matter.
- Call `memory_store` when the user states a durable preference, decision, identity fact, project fact, or reusable workflow.
- Call `memory_extract` on a conversation excerpt when multiple durable memories may be present and categorization would help.
- Call `memory_index_corpus` after the user edits `MEMORY.md` or files under `memory/`.
- Call `memory_index_sessions` when the user wants previous JSONL transcripts included in semantic recall.
- Call `memory_decay_preview` before any cleanup, and only call `memory_prune` with `dryRun: false` after user confirmation.
- Use `scope`, `projectId`, `userId`, and `agentId` consistently so unrelated memories do not mix.
- Prefer categories:
  - `profile` for user identity and durable background facts
  - `preference` for style and tool choices
  - `entity` for people, repos, products, services, and systems
  - `event` for dated events
  - `case` for decisions, incidents, or resolved problems
  - `pattern` for reusable workflows
  - `note` for general facts
