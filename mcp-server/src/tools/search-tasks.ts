import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase } from '../supabase.js'
import { resolveProject, formatTaskLine } from '../helpers.js'

export function registerSearchTasks(server: McpServer) {
  server.tool(
    'search_tasks',
    'Search tasks by text in title or description. Returns matching tasks with their IDs.',
    {
      project: z.string().describe('Project slug'),
      query: z.string().describe('Search text (matches title and description)'),
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project)
        const pattern = `%${args.query}%`

        const { data: tasks, error } = await supabase
          .from('tasks')
          .select(`
            id, title, priority, task_number, story_points, route_path, description,
            column:project_columns!column_id(name),
            tags:task_tags(tag:project_tags(name)),
            assignees:task_assignees(assignee:profiles(full_name)),
            sprint:sprints(name)
          `)
          .eq('project_id', project.id)
          .eq('archived', false)
          .or(`title.ilike.${pattern},description.ilike.${pattern}`)
          .order('task_number', { ascending: true })
          .limit(30)

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        if (!tasks || tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: `No tasks matching "${args.query}" found.` }] }
        }

        const lines = (tasks as any[]).map((t) =>
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
          content: [{ type: 'text' as const, text: `${tasks.length} result${tasks.length !== 1 ? 's' : ''} for "${args.query}":\n\n${lines.join('\n')}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
