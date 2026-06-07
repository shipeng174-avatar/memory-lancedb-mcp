# Roadmap Toward memory-lancedb-pro Parity

This project starts with the MCP-compatible memory surface and will move toward feature parity with `CortexReach/memory-lancedb-pro`.

## Implemented

- MCP stdio server
- SiliconFlow/OpenAI-compatible embeddings
- LanceDB durable vector storage
- Memory CRUD tools
- Scope/user/project/agent isolation keys
- Categories, importance, tags, metadata, source
- Vector, BM25 keyword, and hybrid recall modes
- Optional rerank endpoint
- Smart extraction tool for categorized memories
- Import/export management tools
- Canonical corpus indexing for `MEMORY.md` and `memory/**/*.md`
- Session transcript indexing for `.jsonl` files
- Decay scoring and explicit prune tools
- Backup and migration CLI
- OpenClacky configuration guidance

## Next

- Native LanceDB vector search path for large collections

## MCP Adaptation Notes

OpenClaw plugin hooks such as `before_prompt_build`, auto-capture, and auto-recall cannot be reproduced inside a standalone MCP server by itself. MCP clients need to call memory tools explicitly or implement their own agent instructions that call `memory_recall` and `memory_store` at the right time.
