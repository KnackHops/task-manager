import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase } from '../supabase.js'
import {
  resolveProject,
  resolveColumn,
  resolveTag,
  resolveSprint,
  formatTaskId,
} from '../helpers.js'

export function registerCreateTask(server: McpServer, userId: string) {
  server.tool(
    'create_task',
    'Create a new task in a project. Resolves column, tags, and sprint by slug/name.',
    {
      project: z.string().describe('Project slug'),
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Task description'),
      column: z.string().optional().describe('Column slug (defaults to project default column)'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium').describe('Task priority'),
      tags: z.array(z.string()).optional().describe('Array of tag slugs'),
      assignees: z.array(z.string()).optional().describe('Array of assignee emails'),
      sprint: z.string().optional().describe('Sprint name (or "active")'),
      story_points: z.number().optional().describe('Story points estimate'),
      route_path: z.string().optional().describe('URL or path related to this task'),
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project)

        // Resolve column
        let columnId = project.default_column_id
        if (args.column) {
          const col = await resolveColumn(project.id, args.column)
          columnId = col.id
        }
        if (!columnId) {
          // Fallback to first column
          const { data: cols } = await supabase
            .from('project_columns')
            .select('id')
            .eq('project_id', project.id)
            .order('position')
            .limit(1)
          columnId = cols?.[0]?.id
        }
        if (!columnId) {
          return { content: [{ type: 'text' as const, text: 'Error: No columns in project' }], isError: true }
        }

        // Resolve sprint
        let sprintId: string | null = null
        if (args.sprint) {
          const sprint = await resolveSprint(project.id, args.sprint)
          sprintId = sprint.id
        }

        // Get next position
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id)
          .eq('column_id', columnId)
          .eq('archived', false)

        // Insert task
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({
            project_id: project.id,
            column_id: columnId,
            created_by: userId,
            title: args.title,
            description: args.description ?? null,
            priority: args.priority,
            sprint_id: sprintId,
            story_points: args.story_points ?? null,
            route_path: args.route_path ?? null,
            position: count ?? 0,
          })
          .select('id, task_number')
          .single()

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error creating task: ${error.message}` }], isError: true }
        }

        // Set tags
        if (args.tags?.length) {
          const tagIds: string[] = []
          for (const slug of args.tags) {
            const tag = await resolveTag(project.id, slug)
            tagIds.push(tag.id)
          }
          await supabase
            .from('task_tags')
            .insert(tagIds.map((tagId) => ({ task_id: task.id, tag_id: tagId })))
        }

        // Set assignees
        if (args.assignees?.length) {
          const assigneeIds: string[] = []
          for (const email of args.assignees) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', email)
              .single()
            if (profile) assigneeIds.push(profile.id)
          }
          if (assigneeIds.length > 0) {
            await supabase
              .from('task_assignees')
              .insert(assigneeIds.map((id) => ({ task_id: task.id, assignee_id: id })))
          }
        }

        const taskId = formatTaskId(project.prefix, task.task_number)
        return {
          content: [{ type: 'text' as const, text: `Created task ${taskId}: ${args.title}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
