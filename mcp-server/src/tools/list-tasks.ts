import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase } from '../supabase.js'
import {
  resolveProject,
  resolveColumn,
  resolveTag,
  resolveSprint,
  resolveAssignee,
  formatTaskLine,
} from '../helpers.js'

export function registerListTasks(server: McpServer) {
  server.tool(
    'list_tasks',
    `List tasks in a project. Supports natural queries: filter by tag slug (e.g. 'bug'), column slug (e.g. 'review'), sprint name (or 'active'), assignee name, priority. Combine filters for queries like 'bugs in review for Sprint 1'.`,
    {
      project: z.string().describe('Project slug (required)'),
      column: z.string().optional().describe('Column slug to filter by'),
      tag: z.string().optional().describe('Tag slug to filter by'),
      sprint: z.string().optional().describe('Sprint name to filter by, or "active" for current sprint'),
      assignee: z.string().optional().describe('Assignee name (partial match)'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Priority filter'),
      archived: z.boolean().default(false).describe('Include archived tasks (default: false)'),
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project)

        let query = supabase
          .from('tasks')
          .select(`
            id, title, priority, task_number, story_points, route_path, archived,
            column:project_columns!column_id(id, name, slug),
            tags:task_tags(tag:project_tags(id, name, slug)),
            assignees:task_assignees(assignee:profiles(id, full_name)),
            sprint:sprints(id, name)
          `)
          .eq('project_id', project.id)
          .eq('archived', args.archived)
          .order('task_number', { ascending: true })

        if (args.column) {
          const col = await resolveColumn(project.id, args.column)
          query = query.eq('column_id', col.id)
        }

        if (args.sprint) {
          const sprint = await resolveSprint(project.id, args.sprint)
          query = query.eq('sprint_id', sprint.id)
        }

        if (args.priority) {
          query = query.eq('priority', args.priority)
        }

        const { data: tasks, error } = await query

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        if (!tasks || tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No tasks found matching filters.' }] }
        }

        // Post-query filters (tag, assignee — need join data)
        let filtered = tasks as any[]

        if (args.tag) {
          const tag = await resolveTag(project.id, args.tag)
          filtered = filtered.filter((t: any) =>
            t.tags?.some((tt: any) => tt.tag?.id === tag.id)
          )
        }

        if (args.assignee) {
          const member = await resolveAssignee(project.id, args.assignee)
          const profileId = (member as any).profiles?.id ?? member.user_id
          filtered = filtered.filter((t: any) =>
            t.assignees?.some((ta: any) => ta.assignee?.id === profileId)
          )
        }

        if (filtered.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No tasks found matching filters.' }] }
        }

        // Flatten nested relations for formatting
        const lines = filtered.map((t: any) =>
          formatTaskLine(
            {
              task_number: t.task_number,
              title: t.title,
              priority: t.priority,
              story_points: t.story_points,
              route_path: t.route_path,
              column: t.column,
              tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean),
              assignees: t.assignees?.map((ta: any) => ta.assignee).filter(Boolean),
              sprint: t.sprint,
            },
            project.prefix
          )
        )

        return {
          content: [{ type: 'text' as const, text: `${filtered.length} task${filtered.length !== 1 ? 's' : ''} found:\n\n${lines.join('\n')}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
