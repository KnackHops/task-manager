import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { supabase } from '../supabase.js'

export function registerListProjects(server: McpServer) {
  server.tool(
    'list_projects',
    'List all projects you are a member of. Returns project slugs, names, and prefixes for use with other tools.',
    {},
    async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, slug, prefix, project_members(count)')
        .order('name')

      if (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
      }

      if (!data || data.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No projects found.' }] }
      }

      const lines = data.map((p: any) => {
        const memberCount = p.project_members?.[0]?.count ?? 0
        const prefix = p.prefix ? ` (${p.prefix})` : ''
        return `${p.slug}${prefix}: ${p.name} — ${memberCount} member${memberCount !== 1 ? 's' : ''}`
      })

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )
}
