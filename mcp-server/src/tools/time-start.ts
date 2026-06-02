import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveTaskId } from '../helpers.js'

export function registerStartTaskTimer(server: McpServer, ctx: RequestContext) {
  server.tool(
    'start_task_timer',
    `Start the work timer on a task (e.g. "NT-1" or UUID). Only one timer runs at a time — starting this one automatically stops any timer already running for you. Each start/stop is recorded as one time-log entry.`,
    {
      task_id: z.string().describe('Task ID in prefix-number format (e.g. "NT-1") or UUID'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)
        const { data, error } = await ctx.supabase.rpc('start_task_timer', { p_task_id: taskUUID })
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        const row = data as { started_at: string }
        return { content: [{ type: 'text' as const, text: `Timer started for ${args.task_id} at ${row.started_at}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
