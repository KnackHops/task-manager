# Task Manager

Multi-project Kanban board with sprints, comments, and AI agent integration. Built on Supabase (self-hosted) with no backend server — direct client-to-database via RLS.

## Tech Stack

- React 19 + TypeScript 5
- Vite 6
- TanStack Router (file-based) + TanStack Query 5
- Tailwind CSS v4
- Supabase (auth, database, storage, realtime)
- @hello-pangea/dnd (drag-and-drop)

## Features

- **Kanban Board** — custom columns per project, drag-and-drop reordering
- **Sprints** — planning/active/completed lifecycle, burndown & velocity charts
- **Comments** — @mention autocomplete, real-time updates via Supabase Realtime
- **Attachments** — file upload, inline images in descriptions, drag-to-embed
- **Rich Editor** — contentEditable with mentions, inline images, file links
- **Notifications** — real-time bell with comment/mention/assignment/invite alerts
- **Team** — invite members, granular permissions (7 flags), ownership transfer
- **Tags & Priority** — custom tags with colors per project, 4-level priority
- **Multi-Assignee** — multiple assignees per task with avatar stacking
- **Archive** — manual archive with search, tag filter, sprint filter
- **MCP Server** — AI agent access via Streamable HTTP + API key auth
- **Dark/Light Mode** — toggle in header

## Setup

```bash
git clone <repo-url>
cd task-manager
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL="your-supabase-kong-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
VITE_MCP_URL="your-mcp-server-url/mcp"
```

Run database migrations from `supabase/migrations/` in order (001 through 022).

Start dev server:

```bash
npm run dev
```

## MCP Server

AI agents (Claude Code, etc.) can interact with tasks via the MCP server in `mcp-server/`.

```bash
cd mcp-server
npm install
npm run build
```

Deployed as Streamable HTTP service. Users generate API keys in Settings, then configure their MCP client:

```json
{
  "type": "http",
  "url": "https://your-mcp-url/mcp",
  "headers": {
    "Authorization": "Bearer tm_your_api_key"
  }
}
```

## Deployment

Dockerized with multi-stage builds (Node 20 → nginx for frontend, Node 20 for MCP server). Designed for Coolify but works with any Docker host.

```bash
docker build -t task-manager .
```
