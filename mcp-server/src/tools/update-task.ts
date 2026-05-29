import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import {
  resolveTaskId,
  resolveColumn,
  resolveTag,
  resolveSprint,
  formatTaskId,
} from '../helpers.js'

export function registerUpdateTask(server: McpServer, ctx: RequestContext) {
  server.tool(
    'update_task',
    'Update a task. Resolves column, tags, sprint by slug/name. Only provide fields you want to change. IMPORTANT: Never move a task to a different column automatically. After completing work, remind the user they can move the task to a different column if they\'d like (e.g. "Let me know if you\'d like to move this to a different column").',
    {
      task_id: z.string().describe('Task ID (e.g. "NT-1" or UUID)'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      column: z.string().optional().describe('Column slug to move task to'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
      tags: z.array(z.string()).optional().describe('Replace all tags with these tag slugs'),
      assignees: z.array(z.string()).optional().describe('Replace all assignees with these emails. IMPORTANT: You may remove yourself from assignees, but do not remove other assignees unless the user explicitly asks. When modifying assignees, always preserve existing assignees you are not asked to change.'),
      sprint: z.string().nullable().optional().describe('Sprint name, "active", or null to remove'),
      story_points: z.number().nullable().optional().describe('Story points (null to clear)'),
      route_path: z.string().nullable().optional().describe('URL or path (null to clear)'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        // Fetch current task for project context
        const { data: currentTask, error: fetchErr } = await ctx.supabase
          .from('tasks')
          .select('id, task_number, project_id, project:projects!project_id(id, prefix)')
          .eq('id', taskUUID)
          .single()

        if (fetchErr || !currentTask) {
          return { content: [{ type: 'text' as const, text: `Task not found` }], isError: true }
        }

        const projectId = currentTask.project_id
        const prefix = (currentTask as any).project?.prefix ?? ''

        // Build update payload
        const update: Record<string, any> = {}
        if (args.title !== undefined) update.title = args.title
        if (args.description !== undefined) update.description = args.description
        if (args.priority !== undefined) update.priority = args.priority
        if (args.story_points !== undefined) update.story_points = args.story_points
        if (args.route_path !== undefined) update.route_path = args.route_path

        if (args.column !== undefined) {
          const col = await resolveColumn(ctx.supabase, projectId, args.column)
          update.column_id = col.id
        }

        if (args.sprint !== undefined) {
          if (args.sprint === null) {
            update.sprint_id = null
          } else {
            const sprint = await resolveSprint(ctx.supabase, projectId, args.sprint)
            update.sprint_id = sprint.id
          }
        }

        // Apply update
        if (Object.keys(update).length > 0) {
          const { error: updateErr } = await ctx.supabase
            .from('tasks')
            .update(update)
            .eq('id', taskUUID)

          if (updateErr) {
            return { content: [{ type: 'text' as const, text: `Error updating task: ${updateErr.message}` }], isError: true }
          }
        }

        // Replace tags
        if (args.tags !== undefined) {
          await ctx.supabase.from('task_tags').delete().eq('task_id', taskUUID)
          if (args.tags.length > 0) {
            const tagIds: string[] = []
            for (const slug of args.tags) {
              const tag = await resolveTag(ctx.supabase, projectId, slug)
              tagIds.push(tag.id)
            }
            await ctx.supabase
              .from('task_tags')
              .insert(tagIds.map((tagId) => ({ task_id: taskUUID, tag_id: tagId })))
          }
        }

        // Replace assignees
        if (args.assignees !== undefined) {
          await ctx.supabase.from('task_assignees').delete().eq('task_id', taskUUID)
          if (args.assignees.length > 0) {
            const assigneeIds: string[] = []
            for (const email of args.assignees) {
              const { data: profile } = await ctx.supabase
                .from('profiles')
                .select('id')
                .eq('email', email)
                .single()
              if (profile) assigneeIds.push(profile.id)
            }
            if (assigneeIds.length > 0) {
              await ctx.supabase
                .from('task_assignees')
                .insert(assigneeIds.map((id) => ({ task_id: taskUUID, assignee_id: id })))
            }
          }
        }

        const taskId = formatTaskId(prefix, currentTask.task_number)
        const changed = [
          ...Object.keys(update),
          ...(args.tags !== undefined ? ['tags'] : []),
          ...(args.assignees !== undefined ? ['assignees'] : []),
        ]
        return {
          content: [{ type: 'text' as const, text: `Updated ${taskId}: ${changed.join(', ')}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
