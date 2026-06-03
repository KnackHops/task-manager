import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerWhoami(server: McpServer, ctx: RequestContext) {
  server.tool(
    'whoami',
    'Show the user account the MCP server is authenticated as (derived from the API key in use). Use this to verify which identity tasks, comments, assignments and timers are attributed to.',
    {},
    async () => {
      const { data: profile, error } = await ctx.supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', ctx.userId)
        .single()

      if (error || !profile) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Authenticated as user id ${ctx.userId} (profile lookup failed: ${error?.message ?? 'not found'})`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Authenticated as: ${profile.full_name} <${profile.email}> (id ${profile.id})`,
          },
        ],
      }
    },
  )
}
