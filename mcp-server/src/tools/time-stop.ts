import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerStopTaskTimer(server: McpServer, ctx: RequestContext) {
  server.tool(
    'stop_task_timer',
    `Stop your currently running work timer. Does nothing if no timer is running.`,
    {},
    async () => {
      try {
        const { data, error } = await ctx.supabase.rpc('stop_task_timer')
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        if (!data) return { content: [{ type: 'text' as const, text: 'No timer was running.' }] }
        const row = data as { started_at: string; ended_at: string }
        const secs = Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)
        return { content: [{ type: 'text' as const, text: `Timer stopped. Logged ${Math.floor(secs / 60)}m ${secs % 60}s.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
