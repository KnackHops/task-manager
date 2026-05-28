import { z } from 'zod'
import JSZip from 'jszip'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

// ── Size limits ────────────────────────────────────────────────────
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB download gate
const IMAGE_MAX_SIZE = 5 * 1024 * 1024 // 5 MB (base64 ~33% larger)
const TEXT_MAX_SIZE = 500 * 1024 // 500 KB per-file truncation
const ZIP_MAX_EXTRACTED_SIZE = 25 * 1024 * 1024 // 25 MB total extracted
const ZIP_MAX_FILES = 200
const ZIP_MAX_SINGLE_FILE = 5 * 1024 * 1024 // 5 MB per entry

// ── File type classification ───────────────────────────────────────
type FileCategory = 'text' | 'image' | 'zip' | 'binary'

function classifyByMime(mimeType: string): FileCategory {
  const mime = mimeType.toLowerCase()

  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || mime === 'application/x-zip') {
    return 'zip'
  }

  if (mime.startsWith('image/')) return 'image'

  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/xml' ||
    mime === 'application/yaml' ||
    mime === 'application/x-yaml' ||
    mime === 'application/toml' ||
    mime === 'application/sql' ||
    mime === 'application/graphql' ||
    mime === 'application/x-sh' ||
    mime === 'application/x-httpd-php' ||
    mime === 'application/xhtml+xml' ||
    mime === 'application/ld+json' ||
    mime === 'application/manifest+json' ||
    mime.endsWith('+xml') ||
    mime.endsWith('+json')
  ) {
    return 'text'
  }

  return 'binary'
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'sql', 'graphql', 'gql',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rb', 'rs', 'go', 'java', 'kt', 'kts', 'scala', 'clj', 'cljs',
  'c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'cs', 'fs', 'fsx',
  'swift', 'dart', 'lua', 'r', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'groovy',
  'vue', 'svelte', 'astro', 'prisma', 'proto', 'tf', 'hcl',
])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

function classifyByExtension(fileName: string): FileCategory | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext) return null
  if (ext === 'zip') return 'zip'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

function classify(mimeType: string, fileName: string): FileCategory {
  const byMime = classifyByMime(mimeType)
  if (byMime !== 'binary') return byMime
  return classifyByExtension(fileName) ?? 'binary'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ── Handlers ───────────────────────────────────────────────────────
async function handleText(blob: Blob, fileName: string, fileType: string, sizeKB: number) {
  const buffer = Buffer.from(await blob.arrayBuffer())
  let text = buffer.toString('utf-8')

  let truncated = false
  if (buffer.byteLength > TEXT_MAX_SIZE) {
    text = text.slice(0, TEXT_MAX_SIZE)
    truncated = true
  }

  const header = `**${fileName}** (${fileType}, ${sizeKB}KB)`
  const truncNote = truncated
    ? `\n\n_Content truncated at ${Math.round(TEXT_MAX_SIZE / 1024)}KB. Use \`get_attachment_url\` for the full file._`
    : ''

  return {
    content: [{ type: 'text' as const, text: `${header}\n\n\`\`\`\n${text}\n\`\`\`${truncNote}` }],
  }
}

async function handleImage(blob: Blob, fileName: string, fileType: string, sizeKB: number) {
  const buffer = Buffer.from(await blob.arrayBuffer())
  const base64 = buffer.toString('base64')

  return {
    content: [
      { type: 'text' as const, text: `**${fileName}** (${fileType}, ${sizeKB}KB)` },
      { type: 'image' as const, data: base64, mimeType: fileType },
    ],
  }
}

async function handleZip(blob: Blob, fileName: string, sizeKB: number) {
  const buffer = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)

  const entries = Object.keys(zip.files).sort()
  const lines: string[] = []

  lines.push(`**${fileName}** (ZIP archive, ${sizeKB}KB, ${entries.length} entries)`)
  lines.push('')

  // File tree
  lines.push('## File Tree')
  lines.push('```')
  for (const path of entries.slice(0, ZIP_MAX_FILES)) {
    const entry = zip.files[path]!
    lines.push(entry.dir ? `${path}` : `  ${path}`)
  }
  if (entries.length > ZIP_MAX_FILES) {
    lines.push(`... and ${entries.length - ZIP_MAX_FILES} more entries`)
  }
  lines.push('```')
  lines.push('')

  // File contents
  lines.push('## File Contents')
  lines.push('')

  let totalExtracted = 0
  let filesExtracted = 0
  const skippedBinary: string[] = []
  const skippedTooLarge: string[] = []

  for (const path of entries) {
    if (filesExtracted >= ZIP_MAX_FILES) break

    const entry = zip.files[path]!
    if (entry.dir) continue

    const entryCategory = classifyByExtension(path) ?? 'binary'

    if (entryCategory === 'binary' || entryCategory === 'image') {
      skippedBinary.push(path)
      continue
    }

    try {
      const content = await entry.async('uint8array')

      if (content.byteLength > ZIP_MAX_SINGLE_FILE) {
        skippedTooLarge.push(path)
        continue
      }

      if (totalExtracted + content.byteLength > ZIP_MAX_EXTRACTED_SIZE) {
        lines.push(`_Reached ${Math.round(ZIP_MAX_EXTRACTED_SIZE / 1024 / 1024)}MB extraction limit. Remaining files skipped._`)
        break
      }

      let text = Buffer.from(content).toString('utf-8')

      if (text.length > TEXT_MAX_SIZE) {
        text = text.slice(0, TEXT_MAX_SIZE) + '\n... (truncated)'
      }

      lines.push(`### ${path}`)
      lines.push('```')
      lines.push(text)
      lines.push('```')
      lines.push('')

      totalExtracted += content.byteLength
      filesExtracted++
    } catch {
      skippedBinary.push(path)
    }
  }

  if (skippedBinary.length > 0) {
    lines.push(
      `_Skipped ${skippedBinary.length} binary/image file(s): ${skippedBinary.slice(0, 10).join(', ')}${skippedBinary.length > 10 ? '...' : ''}_`
    )
  }
  if (skippedTooLarge.length > 0) {
    lines.push(
      `_Skipped ${skippedTooLarge.length} file(s) exceeding ${Math.round(ZIP_MAX_SINGLE_FILE / 1024 / 1024)}MB: ${skippedTooLarge.join(', ')}_`
    )
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  }
}

// ── Tool registration ──────────────────────────────────────────────
export function registerReadAttachment(server: McpServer, ctx: RequestContext) {
  server.tool(
    'read_attachment',
    'Read the contents of an attachment inline (use attachment IDs from get_task output). ' +
      'Downloads the file server-side and returns contents directly: ' +
      'text/code files as text, images as inline image data, ' +
      'ZIP archives are extracted showing file tree and text file contents. ' +
      'More expensive than get_attachment_url but lets you read file contents without downloading to user\'s machine. ' +
      'Files over 10MB or unsupported binary formats return metadata only — use get_attachment_url instead. ' +
      'Best for: reading code files, viewing screenshots/images, inspecting ZIP prototype contents.',
    {
      attachment_id: z.string().describe('Attachment UUID (from get_task output)'),
    },
    async (args) => {
      try {
        // Look up attachment
        const { data: attachment, error } = await ctx.supabase
          .from('attachments')
          .select('id, file_name, file_type, file_size, storage_path')
          .eq('id', args.attachment_id)
          .single()

        if (error) {
          return { content: [{ type: 'text' as const, text: `Attachment not found: ${error.message}` }], isError: true }
        }

        const { file_name, file_type, file_size, storage_path } = attachment
        const sizeKB = Math.round(file_size / 1024)
        const category = classify(file_type, file_name)

        // Size gate
        const sizeLimit = category === 'image' ? IMAGE_MAX_SIZE : MAX_FILE_SIZE
        if (file_size > sizeLimit) {
          return {
            content: [{
              type: 'text' as const,
              text: `**${file_name}** (${file_type}, ${formatBytes(file_size)}) exceeds the ${Math.round(sizeLimit / 1024 / 1024)}MB limit for server-side reading.\n\nUse \`get_attachment_url\` with ID \`${attachment.id}\` to get a download URL instead.`,
            }],
          }
        }

        // Binary — no download needed
        if (category === 'binary') {
          return {
            content: [{
              type: 'text' as const,
              text: `**${file_name}** (${file_type}, ${sizeKB}KB)\n\nBinary file — cannot be read inline. Use \`get_attachment_url\` with ID \`${attachment.id}\` to get a download URL.`,
            }],
          }
        }

        // Download from Supabase Storage
        const { data: blob, error: dlError } = await ctx.supabase.storage
          .from('attachments')
          .download(storage_path)

        if (dlError || !blob) {
          return { content: [{ type: 'text' as const, text: `Download failed: ${dlError?.message ?? 'Unknown error'}` }], isError: true }
        }

        // Branch by type
        switch (category) {
          case 'text':
            return await handleText(blob, file_name, file_type, sizeKB)
          case 'image':
            return await handleImage(blob, file_name, file_type, sizeKB)
          case 'zip':
            return await handleZip(blob, file_name, sizeKB)
          default:
            return { content: [{ type: 'text' as const, text: `Unsupported file type: ${file_type}` }] }
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}
