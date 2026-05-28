import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerGetAttachmentUrl(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_attachment_url',
    'Get a signed download URL for an attachment. URL expires in 1 hour.',
    {
      attachment_id: z.string().describe('Attachment UUID'),
    },
    async (args) => {
      try {
        const { data: attachment, error } = await ctx.supabase
          .from('attachments')
          .select('id, file_name, file_type, file_size, storage_path')
          .eq('id', args.attachment_id)
          .single()

        if (error) {
          return { content: [{ type: 'text' as const, text: `Attachment not found: ${error.message}` }], isError: true }
        }

        const { data: signedData, error: signError } = await ctx.supabase.storage
          .from('attachments')
          .createSignedUrl(attachment.storage_path, 3600)

        if (signError || !signedData) {
          return { content: [{ type: 'text' as const, text: `Failed to create signed URL: ${signError?.message}` }], isError: true }
        }

        const sizeKB = Math.round(attachment.file_size / 1024)
        return {
          content: [
            {
              type: 'text' as const,
              text: `**${attachment.file_name}** (${attachment.file_type}, ${sizeKB}KB)\n\nDownload URL (expires in 1 hour):\n${signedData.signedUrl}`,
            },
          ],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
