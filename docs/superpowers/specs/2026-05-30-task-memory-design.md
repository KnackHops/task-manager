# Per-Task Persistent Memory — Design

**Date:** 2026-05-30
**Component:** `mcp-server` (task-manager MCP)
**Status:** Approved

## Problem

The task-manager flow: a ticket (e.g. `NT-1`) is created, then Claude Code calls
the MCP server to pull task info, comments, and attachments, and works the change.
Today every Claude session starts cold. What Claude learned about a ticket last
time — architecture notes, decisions made, gotchas, relevant file locations — is
lost between sessions.

We want a **persistent, per-task memory** that Claude can read and write through the
MCP server, so knowledge accumulates on the ticket itself.

## Decisions

| Question | Decision |
|----------|----------|
| Where does memory live? | **Server-side (Supabase)** — travels with the ticket, survives machine wipes, available from any machine. |
| Structure? | **Key-value facts** — `key` + `value` + optional `type`. Upsert by key. |
| Who sees/writes it? | **Claude-only, hidden** — backend table + MCP tools. No task-manager frontend changes. |
| Scope? | **Shared per task** — any teammate's Claude working the same ticket sees the same memory. `author_id` stored for traceability, not used for filtering. |
| Cleanup? | Task deleted → memory removed automatically via `ON DELETE CASCADE`. |
| Manual reset? | A `clear_task_memory` tool lets the user instruct Claude to wipe a ticket's memory for a fresh context. |

This is distinct from `comments`: comments are human-facing conversation; memory is
Claude's own knowledge store.

## Data model

New table `public.task_memory`:

| column | type | notes |
|--------|------|-------|
| `id` | `uuid` primary key, default `gen_random_uuid()` | |
| `task_id` | `uuid` not null references `public.tasks(id)` **on delete cascade** | auto-cleanup when task deleted |
| `key` | `text` not null | fact name, kebab-case (e.g. `auth-token-flow`) |
| `value` | `text` not null | the fact content |
| `type` | `text` | category: `fact` / `decision` / `gotcha` / `reference`. Nullable, defaults to `fact`. |
| `author_id` | `uuid` references `auth.users(id)` | who/which agent wrote it; traceability only |
| `created_at` | `timestamptz` not null default `now()` | |
| `updated_at` | `timestamptz` not null default `now()` | maintained by trigger |

Constraints / indexes:
- `UNIQUE(task_id, key)` — enables upsert-by-key (rewriting a key overwrites, not duplicates).
- Index on `task_id` for fast per-task reads.
- `updated_at` trigger mirroring the existing `comments_updated_at` pattern.

### RLS

Row Level Security enabled (the MCP server uses a user-scoped client, so RLS is
enforced). Mirror the `comments` table's shared-read model:

- `select` — `using (true)` (any authenticated user can read; memory is shared per task).
- `insert` — `with check (auth.uid() = author_id)` (stamps the writer).
- `update` — `using (true)` (any member can update shared facts; upsert path).
- `delete` — `using (true)` (any member can delete/clear shared facts).

Rationale: memory is intentionally shared and Claude-only. There is no per-user
ownership requirement beyond stamping `author_id` for traceability.

## MCP tools

All registered from a single module `mcp-server/src/tools/task-memory.ts`
(four `register*` functions, tightly related). Each resolves `task_id` via the
existing `resolveTaskId` helper (accepts `NT-1` or UUID).

### `read_task_memory(task_id)`
Returns all facts for the task, grouped by `type`, formatted as markdown. Returns a
clear "no memory stored" message when empty. **Claude should call this at the start
of work on a ticket.**

### `write_task_memory(task_id, key, value, type?)`
Upserts one fact keyed by `(task_id, key)`. `type` defaults to `fact`. Stamps
`author_id = ctx.userId`. Returns confirmation with the resolved task ID and key.

### `delete_task_memory(task_id, key)`
Deletes one fact by key. Returns confirmation (or a not-found note).

### `clear_task_memory(task_id)`
Deletes all facts for the task. The "fresh context" command. Returns the count
removed.

### Tool-description guidance
Descriptions instruct Claude to:
- Read memory before investigating a ticket.
- Store only **durable** facts — architecture, decisions, gotchas, file/route
  locations — not transient progress notes.
- Never store secrets, credentials, or tokens.
- Clear or update memory when the user signals the context is stale.

## Integration touch

`get_task` output gains one line — `**Memory:** N facts stored` — placed near the
`Comments | Attachments` summary line, so Claude is nudged to call
`read_task_memory`. Implemented via a `count` query on `task_memory`.

## Files changed

- `supabase/migrations/022_task_memory.sql` — new table, indexes, RLS, trigger.
- `mcp-server/src/tools/task-memory.ts` — new; 4 register functions.
- `mcp-server/src/index.ts` — import + register the memory tools.
- `mcp-server/src/tools/get-task.ts` — add memory count to the summary line.

## Testing

- Migration applies cleanly on a fresh DB.
- `write` then `read` round-trips a fact.
- `write` same key twice → one row, updated value (upsert).
- `delete` removes one fact; others remain.
- `clear` removes all for the task; other tasks unaffected.
- Deleting a task cascades — its memory rows are gone.
- A second user's API key can read facts written by the first (shared scope).
- `get_task` shows the correct fact count.

## Out of scope (YAGNI)

- Task-manager frontend UI for memory.
- Per-user private memory.
- Full-text search across memory.
- Versioning / history of overwritten facts.
