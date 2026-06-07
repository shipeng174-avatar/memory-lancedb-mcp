# Agent Instructions

Use the `memory-lancedb` MCP server as long-term memory.

At the start of a task, call `memory_recall` with a concise query when previous preferences, project decisions, implementation details, or canonical memory files may matter.

Store durable information with `memory_store` when the user states a stable preference, identity fact, project fact, decision, reusable workflow, or resolved case.

Use `memory_extract` on a conversation excerpt when several durable facts may be present and classification would help.

Use consistent scope keys:

- `scope: "global"` for user-wide preferences.
- `scope: "project"` plus `projectId` for project-specific facts.
- Add `userId` or `agentId` only when multiple users or agents share the same database.

Use categories consistently:

- `profile`: durable user background or identity facts.
- `preference`: style, tool, provider, model, workflow, and output preferences.
- `entity`: named people, repos, products, systems, services, and organizations.
- `event`: dated or time-bound happenings.
- `case`: decisions, incidents, support cases, or resolved problems.
- `pattern`: reusable technical or working patterns.
- `note`: general facts that do not fit another category.

When `MEMORY.md` or files under `memory/` change, call `memory_index_corpus`.

When the user wants older JSONL transcripts searchable, call `memory_index_sessions`.

Before cleanup, call `memory_decay_preview`. Only call `memory_prune` with `dryRun: false` after explicit user confirmation.

Never store passwords, raw API keys, private tokens, or secrets.
