import WebSocket from 'ws'
// @ts-expect-error — polyfill for Node < 22 (no native WebSocket)
globalThis.WebSocket = WebSocket

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { authenticateApiKey, type RequestContext } from './auth.js'
import { registerListProjects } from './tools/list-projects.js'
import { registerListTasks } from './tools/list-tasks.js'
import { registerGetTask } from './tools/get-task.js'
import { registerSearchTasks } from './tools/search-tasks.js'
import { registerGetAttachmentUrl } from './tools/get-attachment-url.js'
import { registerReadAttachment } from './tools/read-attachment.js'
import { registerCreateTask } from './tools/create-task.js'
import { registerUpdateTask } from './tools/update-task.js'
import { registerAddComment } from './tools/add-comment.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

function createServer(ctx: RequestContext): McpServer {
  const server = new McpServer({
    name: 'task-manager',
    version: '1.0.0',
  })

  registerListProjects(server, ctx)
  registerListTasks(server, ctx)
  registerGetTask(server, ctx)
  registerSearchTasks(server, ctx)
  registerGetAttachmentUrl(server, ctx)
  registerReadAttachment(server, ctx)
  registerCreateTask(server, ctx)
  registerUpdateTask(server, ctx)
  registerAddComment(server, ctx)

  return server
}

const app = createMcpExpressApp({ host: '0.0.0.0' })

// Stateless: each POST creates fresh server + transport
app.post('/mcp', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing API key. Use Authorization: Bearer <key>' },
      id: null,
    })
    return
  }

  const apiKey = authHeader.slice(7)

  try {
    const ctx = await authenticateApiKey(apiKey)
    const server = createServer(ctx)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)

    res.on('close', () => {
      transport.close()
      server.close()
    })
  } catch (err: any) {
    console.error('Auth error:', err.message)
    if (!res.headersSent) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid API key' },
        id: null,
      })
    }
  }
})

// GET/DELETE not supported in stateless mode
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  })
})

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP HTTP server listening on port ${PORT}`)
})

process.on('SIGINT', () => {
  console.log('Shutting down...')
  process.exit(0)
})
