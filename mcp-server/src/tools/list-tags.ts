import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveProject } from '../helpers.js'

export function registerListTags(server: McpServer, ctx: RequestContext) {
  server.tool(
    'list_tags',
    'List the tags available in a project. Returns tag slugs (for use with create_task/update_task/list_tasks), names, and colors.',
    {
      project: z.string().describe('Project slug (required)'),
    },
    async (args) => {
      try {
        const project = await resolveProject(ctx.supabase, args.project)

        const { data, error } = await ctx.supabase
          .from('project_tags')
          .select('name, slug, color')
          .eq('project_id', project.id)
          .order('name')

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        if (!data || data.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No tags found in this project.' }] }
        }

        const lines = data.map((t: any) => `${t.slug}: ${t.name}${t.color ? ` (${t.color})` : ''}`)

        return {
          content: [{ type: 'text' as const, text: `${data.length} tag${data.length !== 1 ? 's' : ''}:\n\n${lines.join('\n')}` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
