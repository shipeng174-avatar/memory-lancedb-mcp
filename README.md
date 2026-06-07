# memory-lancedb-mcp

LanceDB long-term memory as an MCP server, designed as an MCP-oriented counterpart to `CortexReach/memory-lancedb-pro`.

This project is not a generic LanceDB demo. It exposes memory-shaped tools for MCP clients such as OpenClacky, Claude Desktop, Cursor, and other agent clients that support MCP but do not support OpenClaw plugins.

## Why This Exists

`memory-lancedb-pro` is an OpenClaw plugin. Some OpenClaw-like clients can use MCP servers but cannot load OpenClaw plugins. This project moves the useful long-term memory surface into MCP tools:

- `memory_store`
- `memory_recall`
- `memory_forget`
- `memory_update`
- `memory_list`
- `memory_stats`
- `memory_extract`
- `memory_export`
- `memory_import`
- `memory_index_corpus`
- `memory_index_sessions`
- `memory_decay_preview`
- `memory_prune`

The official `lancedb/lancedb-mcp-server` is a useful LanceDB reference server, but it is intentionally basic: ingest docs, retrieve docs, and inspect table details. This project adds the memory semantics expected by agent workflows: scope isolation, categories, tags, importance, metadata, hybrid scoring, optional rerank, and provider-based embeddings.

See `docs/parity.md` for a detailed map between `memory-lancedb-pro` plugin features and this MCP adaptation.

## Current Feature Map

| Capability | Status |
| --- | --- |
| LanceDB vector storage | Implemented |
| SiliconFlow embeddings | Implemented |
| OpenAI-compatible embedding base URL | Implemented |
| `memory_store` | Implemented |
| `memory_recall` | Implemented |
| `memory_forget` | Implemented |
| `memory_update` | Implemented |
| `memory_list` | Implemented |
| `memory_stats` | Implemented |
| `memory_extract` | Implemented |
| `memory_export` / `memory_import` | Implemented |
| `memory_index_corpus` | Implemented |
| `memory_index_sessions` | Implemented |
| `memory_decay_preview` / `memory_prune` | Implemented |
| Scope isolation | Implemented |
| User/project/agent isolation keys | Implemented |
| Categories: profile/preference/entity/event/case/pattern/note | Implemented |
| Tags and metadata | Implemented |
| Hybrid retrieval | Implemented with vector + keyword score fusion |
| Rerank | Optional, provider endpoint configurable |
| Smart extraction | Implemented with OpenAI-compatible chat endpoint |
| Auto-capture hooks | MCP clients must call tools explicitly |
| Canonical corpus indexing | Implemented for `MEMORY.md` and `memory/**/*.md` |
| Session transcript indexing | Implemented for `.jsonl` files |
| Intelligent forgetting | Implemented as decay scoring plus explicit prune tools |
| Import/export management tools | Implemented |

## Requirements

- Node.js 20+
- A SiliconFlow API key
- Network access to `https://api.siliconflow.cn`

## Install From npm

After the package is published, OpenClacky can run it directly with `npx`; users do not need to clone or build the source.

```bash
npx -y memory-lancedb-mcp
```

For global installation:

```bash
npm install -g memory-lancedb-mcp
memory-lancedb-mcp
```

For CLI maintenance commands after global installation:

```bash
memory-lancedb-mcp-cli stats
memory-lancedb-mcp-cli export --scope global --output backup.json
```

## Source Setup

```powershell
npm install
Copy-Item .env.example .env
npm run build
npm test
npm run smoke
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the same build, test, and MCP smoke checks after the project is pushed to GitHub.

## Publish To npm

The package name `memory-lancedb-mcp` is intended to publish as a public npm package.

```bash
npm login
npm test
npm run smoke
npm run pack:check
npm publish --access public
```

Edit `.env`:

```env
SILICONFLOW_API_KEY=your_key_here
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=BAAI/bge-m3

EXTRACTION_ENABLED=true
EXTRACTION_BASE_URL=https://api.siliconflow.cn/v1
EXTRACTION_MODEL=Qwen/Qwen2.5-7B-Instruct

CANONICAL_CORPUS_ENABLED=true
CANONICAL_ROOT=.
CANONICAL_MAX_CHARS=1800

SESSION_TRANSCRIPTS_ENABLED=true
SESSION_TRANSCRIPTS_ROOT=.
SESSION_MAX_CHARS=2200

DECAY_ENABLED=true
DECAY_HALF_LIFE_DAYS=90
DECAY_IMPORTANCE_WEIGHT=0.65
DECAY_ACCESS_WEIGHT=0.2
PRUNE_SCORE_THRESHOLD=0.12
PRUNE_MIN_AGE_DAYS=30

REDACT_SECRETS=true

LANCEDB_PATH=./memory-data/lancedb
LANCEDB_TABLE=memories
```

## OpenClacky MCP Config

OpenClacky uses the same `mcpServers` format as Claude Desktop and Cursor. The main OpenClacky-specific addition is `description`, which the main agent sees when deciding which MCP server to call.

See `examples/openclacky.mcp.json` for a copyable config and `examples/agent-instructions.md` for suggested agent behavior.

Put this in global config:

```text
~/.clacky/mcp.json
```

Or put it in a project-local config:

```text
<project>/.clacky/mcp.json
```

Both files are loaded. If a project config defines the same server name as the global config, the project config wins.

Use an absolute `LANCEDB_PATH` because an MCP stdio server's working directory may not be the project directory.

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

Do not commit your API key. Keep it in the client MCP config or a local `.env`.

OpenClacky starts MCP processes lazily on first use and shuts idle servers down after about 5 minutes, so this server should not run continuously unless a client is actively using it.

If OpenClacky cannot find `npx`, install the package globally with `npm install -g memory-lancedb-mcp` and use `"command": "memory-lancedb-mcp"` with an empty `args` array.

`.env` is only a local development convenience. For OpenClacky usage, prefer putting required variables in the MCP server's `env` block.

## Tool Examples

### Store a Memory

```json
{
  "text": "The user prefers SiliconFlow BAAI/bge-m3 for embeddings.",
  "scope": "global",
  "category": "preference",
  "importance": 0.8,
  "tags": ["embedding", "siliconflow"]
}
```

### Recall Memories

```json
{
  "query": "Which embedding provider should I use?",
  "scope": "global",
  "limit": 8,
  "mode": "hybrid"
}
```

### Use Project Isolation

```json
{
  "query": "What memory system are we building?",
  "scope": "project",
  "projectId": "memory-lancedb-mcp"
}
```

### Extract Memories From Conversation Text

```json
{
  "text": "User: I prefer SiliconFlow BAAI/bge-m3 for embeddings. Assistant: Noted.",
  "scope": "global",
  "source": "conversation",
  "store": true,
  "maxMemories": 5
}
```

### Export Memories

```json
{
  "scope": "global",
  "outputPath": "C:/Users/czy58/.openclacky/memory/backup.json"
}
```

### Import Memories

```json
{
  "inputPath": "C:/Users/czy58/.openclacky/memory/backup.json",
  "scope": "global"
}
```

## CLI

The MCP server is the primary interface, but a small CLI is included for backup and maintenance:

```powershell
memory-lancedb-mcp-cli stats
memory-lancedb-mcp-cli export --scope global --output backup.json
memory-lancedb-mcp-cli import --input backup.json --scope global
memory-lancedb-mcp-cli decay-preview --scope global
memory-lancedb-mcp-cli prune --scope global --yes
```

`prune` defaults to dry run unless `--yes` is passed.

### Index Canonical Corpus

This indexes `MEMORY.md` and `memory/**/*.md` under a root folder. The files remain the human-readable source of truth; LanceDB stores semantic chunks with citations.
Corpus chunks use stable ids, so rerunning the index replaces prior chunks instead of duplicating them.

```json
{
  "root": "C:/Users/czy58/Documents/api",
  "scope": "global",
  "maxChars": 1800
}
```

### Index Session Transcripts

This indexes `.jsonl` transcript files from a file or directory. Each stored chunk includes citation metadata for its source file and line span.
Session chunks also use stable ids, so rerunning the same transcript import is safe.

```json
{
  "root": "C:/Users/czy58/.openclacky/sessions",
  "scope": "global",
  "maxChars": 2200
}
```

### Preview and Prune Decayed Memories

Preview first:

```json
{
  "scope": "global",
  "threshold": 0.12,
  "minAgeDays": 30
}
```

Prune only when you are sure:

```json
{
  "scope": "global",
  "threshold": 0.12,
  "minAgeDays": 30,
  "dryRun": false
}
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SILICONFLOW_API_KEY` | empty | SiliconFlow API key |
| `EMBEDDING_API_KEY` | empty | Alternative API key variable |
| `EMBEDDING_PROVIDER` | `openai-compatible` | Use `mock` only for tests/local smoke without API calls |
| `EMBEDDING_BASE_URL` | `https://api.siliconflow.cn/v1` | OpenAI-compatible API base URL |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | Embedding model |
| `LANCEDB_PATH` | `./memory-data/lancedb` | Local LanceDB path |
| `LANCEDB_TABLE` | `memories` | LanceDB table |
| `DEFAULT_SCOPE` | `global` | Default memory scope |
| `DEFAULT_LIMIT` | `8` | Default recall limit |
| `RETRIEVAL_MODE` | `hybrid` | `vector`, `keyword`, or `hybrid` |
| `VECTOR_WEIGHT` | `0.7` | Hybrid vector score weight |
| `BM25_WEIGHT` | `0.3` | Hybrid keyword score weight |
| `MIN_SCORE` | `0` | Minimum result score |
| `RERANK_ENABLED` | `false` | Enable reranker call |
| `RERANK_BASE_URL` | `https://api.siliconflow.cn/v1` | Reranker API base URL |
| `RERANK_MODEL` | `BAAI/bge-reranker-v2-m3` | Reranker model |
| `EXTRACTION_ENABLED` | `true` | Enable smart extraction |
| `EXTRACTION_BASE_URL` | `https://api.siliconflow.cn/v1` | OpenAI-compatible chat API base URL |
| `EXTRACTION_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | Chat model used for extraction |
| `EXTRACTION_MIN_IMPORTANCE` | `0.35` | Drop extracted memories below this importance |
| `CANONICAL_CORPUS_ENABLED` | `true` | Enable canonical corpus indexing |
| `CANONICAL_ROOT` | `.` | Root searched for `MEMORY.md` and `memory/**/*.md` |
| `CANONICAL_MAX_CHARS` | `1800` | Max characters per indexed corpus chunk |
| `SESSION_TRANSCRIPTS_ENABLED` | `true` | Enable session transcript indexing |
| `SESSION_TRANSCRIPTS_ROOT` | `.` | File or directory searched for `.jsonl` transcripts |
| `SESSION_MAX_CHARS` | `2200` | Max characters per indexed session chunk |
| `DECAY_ENABLED` | `true` | Enable recall score decay |
| `DECAY_HALF_LIFE_DAYS` | `90` | Half-life used by the time decay factor |
| `DECAY_IMPORTANCE_WEIGHT` | `0.65` | Importance contribution to memory survival |
| `DECAY_ACCESS_WEIGHT` | `0.2` | Access-count contribution to memory survival |
| `PRUNE_SCORE_THRESHOLD` | `0.12` | Default prune candidate threshold |
| `PRUNE_MIN_AGE_DAYS` | `30` | Minimum age before prune candidates appear |
| `REDACT_SECRETS` | `true` | Redact common API keys, bearer tokens, JWTs, and secret assignments before storage |

## Notes

MCP does not provide OpenClaw plugin hooks such as automatic prompt injection. A client or agent prompt should call `memory_recall` near the start of a task, call `memory_store` when a durable preference is explicit, or call `memory_extract` over conversation text when it wants smart automatic capture.

`EMBEDDING_PROVIDER=mock` is intended for automated tests and local development only. Use SiliconFlow or another OpenAI-compatible embedding endpoint for real memory retrieval.
