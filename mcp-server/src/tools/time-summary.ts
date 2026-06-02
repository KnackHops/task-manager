import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

function fmt(secs: number) {
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export function registerGetTimeSummary(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_time_summary',
    `Get your total tracked time for a range: "today", "month" (current calendar month), or "sprint" (requires sprint_id).`,
    {
      range: z.enum(['today', 'month', 'sprint']).describe('Which total to compute'),
      sprint_id: z.string().optional().describe('Sprint UUID — required when range is "sprint"'),
    },
    async (args) => {
      try {
        let fromIso: string | undefined
        let taskIds: string[] | undefined

        if (args.range === 'today') {
          const n = new Date()
          fromIso = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString()
        } else if (args.range === 'month') {
          const n = new Date()
          fromIso = new Date(n.getFullYear(), n.getMonth(), 1).toISOString()
        } else {
          if (!args.sprint_id) return { content: [{ type: 'text' as const, text: 'Error: sprint_id is required for range "sprint".' }], isError: true }
          const { data: tasks, error: tErr } = await ctx.supabase.from('tasks').select('id').eq('sprint_id', args.sprint_id)
          if (tErr) return { content: [{ type: 'text' as const, text: `Error: ${tErr.message}` }], isError: true }
          taskIds = (tasks ?? []).map((t: any) => t.id)
          if (taskIds.length === 0) return { content: [{ type: 'text' as const, text: 'Sprint total: 0h 0m (no tasks).' }] }
        }

        let q = ctx.supabase.from('task_time_sessions').select('started_at, ended_at').eq('user_id', ctx.userId)
        if (fromIso) q = q.gte('started_at', fromIso)
        if (taskIds) q = q.in('task_id', taskIds)
        const { data, error } = await q
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

        let secs = 0
        for (const s of data ?? []) {
          const row = s as { started_at: string; ended_at: string | null }
          const end = row.ended_at ? new Date(row.ended_at).getTime() : Date.now()
          secs += Math.max(0, Math.floor((end - new Date(row.started_at).getTime()) / 1000))
        }
        return { content: [{ type: 'text' as const, text: `${args.range} total: ${fmt(secs)}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
