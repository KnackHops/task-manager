import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { authenticate } from './supabase.js'
import { registerListProjects } from './tools/list-projects.js'
import { registerListTasks } from './tools/list-tasks.js'
import { registerGetTask } from './tools/get-task.js'
import { registerSearchTasks } from './tools/search-tasks.js'
import { registerGetAttachmentUrl } from './tools/get-attachment-url.js'
import { registerCreateTask } from './tools/create-task.js'
import { registerUpdateTask } from './tools/update-task.js'
import { registerAddComment } from './tools/add-comment.js'

async function main() {
  // Authenticate with Supabase
  const userId = await authenticate()
  console.error(`Authenticated as user ${userId}`)

  const server = new McpServer({
    name: 'task-manager',
    version: '1.0.0',
  })

  // Register all tools
  registerListProjects(server)
  registerListTasks(server)
  registerGetTask(server)
  registerSearchTasks(server)
  registerGetAttachmentUrl(server)
  registerCreateTask(server, userId)
  registerUpdateTask(server)
  registerAddComment(server, userId)

  // Connect via stdio
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('MCP server running on stdio')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
