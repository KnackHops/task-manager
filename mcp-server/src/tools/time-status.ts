import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerGetTimerStatus(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_timer_status',
    `Check whether you have a work timer running right now, which task, and for how long.`,
    {},
    async () => {
      try {
        const { data, error } = await ctx.supabase
          .from('task_time_sessions')
          .select('started_at, task:tasks!task_id(title, task_number, project:projects!project_id(prefix))')
          .eq('user_id', ctx.userId)
          .is('ended_at', null)
          .maybeSingle()
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        if (!data) return { content: [{ type: 'text' as const, text: 'No timer running.' }] }
        const row = data as any
        const secs = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
        const id = row.task ? `${row.task.project?.prefix}-${row.task.task_number}` : '?'
        return {
          content: [{ type: 'text' as const, text: `Running: ${id} "${row.task?.title ?? ''}" — ${Math.floor(secs / 60)}m ${secs % 60}s elapsed.` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
