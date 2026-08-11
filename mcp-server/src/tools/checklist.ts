import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerUpdateChecklistItem(server: McpServer, ctx: RequestContext) {
  server.tool(
    'update_checklist_item',
    'Update a checklist item (toggle done, edit title). Works on task checklists and on checklists inside a comment. Use item IDs from get_task output.',
    {
      item_id: z.string().describe('Checklist item UUID (from get_task output, task or comment checklist)'),
      is_done: z.boolean().optional().describe('Mark done or not done'),
      title: z.string().optional().describe('New title'),
    },
    async (args) => {
      try {
        const updates: Record<string, unknown> = {}
        if (args.is_done !== undefined) updates.is_done = args.is_done
        if (args.title !== undefined) updates.title = args.title
        if (Object.keys(updates).length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: provide is_done or title' }], isError: true }
        }

        // Task and comment checklist IDs come from disjoint tables — try task first, fall back to comment.
        const apply = (table: string) =>
          ctx.supabase.from(table).update(updates).eq('id', args.item_id).select('id, title, is_done').maybeSingle()

        let { data, error } = await apply('task_checklist_items')
        if (!error && !data) {
          const commentResult = await apply('comment_checklist_items')
          data = commentResult.data
          error = commentResult.error
          if (!error && !data) {
            return {
              content: [{
                type: 'text' as const,
                text: 'Error: checklist item not found, or you are not the author of the comment it belongs to (comment checklists are editable only by their comment author).',
              }],
              isError: true,
            }
          }
        }

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        const check = (data as any).is_done ? '✓' : '○'
        return { content: [{ type: 'text' as const, text: `${check} ${(data as any).title}` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
