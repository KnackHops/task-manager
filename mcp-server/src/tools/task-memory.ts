import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveTaskId, formatTaskId } from '../helpers.js'

const MEMORY_TYPES = ['fact', 'decision', 'gotcha', 'reference'] as const

// Shared formatting of a task's resolved display ID for confirmations.
async function taskDisplayId(ctx: RequestContext, taskUUID: string): Promise<string> {
  const { data: task } = await ctx.supabase
    .from('tasks')
    .select('task_number, project:projects!project_id(prefix)')
    .eq('id', taskUUID)
    .single()
  const prefix = (task as any)?.project?.prefix ?? ''
  return task ? formatTaskId(prefix, (task as any).task_number) : taskUUID
}

export function registerReadTaskMemory(server: McpServer, ctx: RequestContext) {
  server.tool(
    'read_task_memory',
    `Read Claude's persistent memory for a task — durable facts learned in prior sessions (architecture notes, decisions, gotchas, relevant file/route locations). ALWAYS call this at the start of work on a ticket, before investigating, so you don't relearn what's already known. Memory is shared across everyone working the ticket. This is separate from comments (human conversation).`,
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        const { data: rows, error } = await ctx.supabase
          .from('task_memory')
          .select('key, value, type, updated_at')
          .eq('task_id', taskUUID)
          .order('type', { ascending: true })
          .order('updated_at', { ascending: false })

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        const taskId = await taskDisplayId(ctx, taskUUID)

        if (!rows || rows.length === 0) {
          return { content: [{ type: 'text' as const, text: `No memory stored for ${taskId} yet. As you work, use write_task_memory to record durable facts.` }] }
        }

        // Group by type
        const byType = new Map<string, typeof rows>()
        for (const r of rows) {
          const t = (r as any).type ?? 'fact'
          if (!byType.has(t)) byType.set(t, [])
          byType.get(t)!.push(r)
        }

        const lines: string[] = [`# Memory for ${taskId} (${rows.length} fact${rows.length === 1 ? '' : 's'})`]
        for (const [type, items] of byType) {
          lines.push('')
          lines.push(`## ${type}`)
          for (const r of items) {
            lines.push(`- **${(r as any).key}:** ${(r as any).value}`)
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}

export function registerWriteTaskMemory(server: McpServer, ctx: RequestContext) {
  server.tool(
    'write_task_memory',
    `Store a durable fact in a task's persistent memory, keyed by a short kebab-case key. Writing an existing key overwrites it. Store ONLY durable knowledge useful in future sessions — architecture, decisions, gotchas, file/route locations. Do NOT store transient progress notes, or any secrets, credentials, or tokens. Memory is shared across everyone working the ticket.`,
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
      key: z.string().describe('Short kebab-case key, e.g. "auth-token-flow"'),
      value: z.string().describe('The fact to remember'),
      type: z.enum(MEMORY_TYPES).default('fact').describe('Category of the fact (default: fact)'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        const { error } = await ctx.supabase
          .from('task_memory')
          .upsert(
            {
              task_id: taskUUID,
              key: args.key,
              value: args.value,
              type: args.type,
              author_id: ctx.userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'task_id,key' }
          )

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error writing memory: ${error.message}` }], isError: true }
        }

        const taskId = await taskDisplayId(ctx, taskUUID)
        return { content: [{ type: 'text' as const, text: `Saved memory for ${taskId}: ${args.key} [${args.type}]` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}

export function registerDeleteTaskMemory(server: McpServer, ctx: RequestContext) {
  server.tool(
    'delete_task_memory',
    `Delete a single stale fact from a task's persistent memory by its key. Use when a stored fact is no longer true.`,
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
      key: z.string().describe('The key of the fact to delete'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        const { data, error } = await ctx.supabase
          .from('task_memory')
          .delete()
          .eq('task_id', taskUUID)
          .eq('key', args.key)
          .select('key')

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error deleting memory: ${error.message}` }], isError: true }
        }

        const taskId = await taskDisplayId(ctx, taskUUID)
        if (!data || data.length === 0) {
          return { content: [{ type: 'text' as const, text: `No fact "${args.key}" found for ${taskId}.` }] }
        }
        return { content: [{ type: 'text' as const, text: `Deleted memory "${args.key}" from ${taskId}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}

export function registerClearTaskMemory(server: McpServer, ctx: RequestContext) {
  server.tool(
    'clear_task_memory',
    `Wipe ALL persistent memory for a task — a fresh-context reset. Only use when the user explicitly asks to clear or reset the task's memory. This affects everyone working the ticket and cannot be undone.`,
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        const { data, error } = await ctx.supabase
          .from('task_memory')
          .delete()
          .eq('task_id', taskUUID)
          .select('key')

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error clearing memory: ${error.message}` }], isError: true }
        }

        const taskId = await taskDisplayId(ctx, taskUUID)
        const count = data?.length ?? 0
        return { content: [{ type: 'text' as const, text: `Cleared ${count} fact${count === 1 ? '' : 's'} from ${taskId}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
