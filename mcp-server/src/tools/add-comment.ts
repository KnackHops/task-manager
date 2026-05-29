import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveTaskId, formatTaskId } from '../helpers.js'

export function registerAddComment(server: McpServer, ctx: RequestContext) {
  server.tool(
    'add_comment',
    `Add a comment to a task. Only use this when the user explicitly asks you to comment on a task, or when you need to ask a clarifying question because task context is insufficient. Never automatically post comments (e.g. status updates, progress notes) without being asked. The comment author is the authenticated MCP user.`,
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
      body: z.string().describe('Comment body text'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        // Get task info for response
        const { data: task } = await ctx.supabase
          .from('tasks')
          .select('task_number, project:projects!project_id(prefix)')
          .eq('id', taskUUID)
          .single()

        const { data: comment, error } = await ctx.supabase
          .from('comments')
          .insert({
            task_id: taskUUID,
            author_id: ctx.userId,
            body: args.body,
          })
          .select('id, created_at')
          .single()

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error adding comment: ${error.message}` }], isError: true }
        }

        const prefix = (task as any)?.project?.prefix ?? ''
        const taskId = task ? formatTaskId(prefix, task.task_number) : args.task_id

        return {
          content: [{ type: 'text' as const, text: `Comment added to ${taskId}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
