# memory-lancedb-pro Parity

This document tracks how `memory-lancedb-mcp` maps the core ideas of `CortexReach/memory-lancedb-pro` into a standalone MCP server.

## Implemented In MCP

| memory-lancedb-pro area | MCP equivalent |
| --- | --- |
| LanceDB-backed memory store | LanceDB table configured by `LANCEDB_PATH` and `LANCEDB_TABLE` |
| `memory_store` | `memory_store` |
| `memory_recall` | `memory_recall` |
| `memory_forget` | `memory_forget` |
| Memory update/management | `memory_update`, `memory_list`, `memory_stats` |
| Smart extraction | `memory_extract` using OpenAI-compatible chat completions |
| 6-category classification | `profile`, `preference`, `entity`, `event`, `case`, `pattern`, plus fallback `note` |
| Provider flexibility | OpenAI-compatible embedding/rerank/extraction endpoints, defaulting to SiliconFlow |
| Hybrid retrieval | Vector score + BM25 keyword score weighted fusion |
| Cross-encoder rerank | Optional `/rerank` provider call |
| Multi-scope isolation | `scope`, `userId`, `projectId`, `agentId` |
| Canonical corpus | `memory_index_corpus` for `MEMORY.md` and `memory/**/*.md` |
| Session transcripts | `memory_index_sessions` for `.jsonl` transcripts |
| Import/export | `memory_export`, `memory_import` |
| Intelligent forgetting | Decay scoring plus `memory_decay_preview` and explicit `memory_prune` |
| Setup guidance | OpenClacky MCP examples and agent instructions |
| Safety guard | Basic secret redaction before storage |
| Verification | TypeScript build, Node tests, MCP smoke test, GitHub Actions CI |

## MCP-Specific Adaptations

Some OpenClaw plugin behavior depends on plugin hooks and cannot be reproduced by a passive MCP server alone.

| Plugin behavior | MCP adaptation |
| --- | --- |
| `before_prompt_build` auto-recall | Client or agent instruction calls `memory_recall` at task start |
| Auto-capture from every conversation | Client or agent instruction calls `memory_store` or `memory_extract` |
| OpenClaw memory slot registration | OpenClacky loads this as a normal MCP server |
| Public artifacts registration | `memory_index_corpus` indexes files and stores path/citation metadata |
| OpenClaw CLI commands | MCP tools plus `memory-lancedb-mcp-cli` expose management operations |

## Not Yet Implemented

These are remaining parity or hardening opportunities:

- Native LanceDB ANN search path for large memory collections.
- Dreaming/reflection sidecar compatibility.
- Rich schema migrations for old exported memory shapes.
- Full provider-specific adapters for Ollama, Gemini, Jina, and OpenAI beyond OpenAI-compatible endpoints.

## Completion Criteria For Practical Use

The current MCP server is practically usable when:

- `npm test` passes.
- `npm run smoke` lists all MCP tools.
- OpenClacky has an `mcpServers.memory-lancedb` entry with a clear `description`.
- `SILICONFLOW_API_KEY` or another embedding provider key is configured.
- `LANCEDB_PATH` points to a durable local directory.
- The agent is instructed to call `memory_recall`, `memory_store`, and `memory_extract` appropriately.
