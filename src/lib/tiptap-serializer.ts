/**
 * Serialize between our plain-text storage format and Tiptap JSON.
 *
 * Storage format tokens:
 *   @[Name](uuid)       mention
 *   ![](uuid)           inline image
 *   %[filename](uuid)   file link
 *   **bold**             bold
 *   *italic*             italic
 *   ~~strike~~           strikethrough
 *   `code`               inline code
 *   [text](url)          link
 *   - item               bullet list item
 *   1. item              ordered list item
 */

import type { JSONContent } from '@tiptap/core'

// ─── Regex patterns ────────────────────────────────────────────────

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/
const IMAGE_RE = /!\[\]\(([0-9a-f-]{36})\)/
const FILE_LINK_RE = /%\[([^\]]+)\]\(([0-9a-f-]{36})\)/
const BOLD_RE = /\*\*(.+?)\*\*/
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/
const STRIKE_RE = /~~(.+?)~~/
const CODE_RE = /`([^`]+)`/
const LINK_RE = /(?<![!%@])\[([^\]]+)\]\(([^)]+)\)/

// Ordered by priority — longer/more specific patterns first
const INLINE_PATTERNS = [
  { re: MENTION_RE, type: 'mention' as const },
  { re: IMAGE_RE, type: 'image' as const },
  { re: FILE_LINK_RE, type: 'file_link' as const },
  { re: BOLD_RE, type: 'bold' as const },
  { re: STRIKE_RE, type: 'strike' as const },
  { re: CODE_RE, type: 'code' as const },
  { re: LINK_RE, type: 'link' as const },
  { re: ITALIC_RE, type: 'italic' as const },
]

// ─── Raw text → Tiptap JSON ───────────────────────────────────────

/** Parse our raw body string into a Tiptap-compatible JSONContent document. */
export function toTiptapDoc(raw: string): JSONContent {
  if (!raw) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }

  const lines = raw.split('\n')
  const content: JSONContent[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Detect bullet list block
    if (/^- /.test(line)) {
      const items: JSONContent[] = []
      while (i < lines.length && /^- /.test(lines[i]!)) {
        const itemContent = parseInline(lines[i]!.slice(2))
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: itemContent }],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    // Detect ordered list block
    if (/^\d+\. /.test(line)) {
      const items: JSONContent[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        const text = lines[i]!.replace(/^\d+\. /, '')
        const itemContent = parseInline(text)
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: itemContent }],
        })
        i++
      }
      content.push({ type: 'orderedList', content: items })
      continue
    }

    // Regular paragraph (empty line = empty paragraph)
    if (line === '') {
      content.push({ type: 'paragraph' })
    } else {
      const inlineContent = parseInline(line)
      content.push({
        type: 'paragraph',
        content: inlineContent.length > 0 ? inlineContent : undefined,
      })
    }
    i++
  }

  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

/** Parse inline tokens within a single line of text → Tiptap inline nodes. */
function parseInline(text: string): JSONContent[] {
  if (!text) return []

  const nodes: JSONContent[] = []
  let remaining = text

  while (remaining.length > 0) {
    // Find earliest match across all patterns
    let earliest: {
      index: number
      match: RegExpExecArray
      type: (typeof INLINE_PATTERNS)[number]['type']
    } | null = null

    for (const pattern of INLINE_PATTERNS) {
      const re = new RegExp(pattern.re.source, pattern.re.flags)
      const m = re.exec(remaining)
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m, type: pattern.type }
      }
    }

    if (!earliest) {
      // No more patterns — rest is plain text
      nodes.push({ type: 'text', text: remaining })
      break
    }

    // Text before the match
    if (earliest.index > 0) {
      nodes.push({ type: 'text', text: remaining.slice(0, earliest.index) })
    }

    const m = earliest.match

    switch (earliest.type) {
      case 'mention':
        nodes.push({
          type: 'mention',
          attrs: { id: m[2], label: m[1] },
        })
        break
      case 'image':
        nodes.push({
          type: 'image',
          attrs: { src: '', 'data-inline-id': m[1] },
        })
        break
      case 'file_link':
        nodes.push({
          type: 'fileLink',
          attrs: { id: m[2], fileName: m[1] },
        })
        break
      case 'bold':
        nodes.push({
          type: 'text',
          text: m[1],
          marks: [{ type: 'bold' }],
        })
        break
      case 'italic':
        nodes.push({
          type: 'text',
          text: m[1],
          marks: [{ type: 'italic' }],
        })
        break
      case 'strike':
        nodes.push({
          type: 'text',
          text: m[1],
          marks: [{ type: 'strike' }],
        })
        break
      case 'code':
        nodes.push({
          type: 'text',
          text: m[1],
          marks: [{ type: 'code' }],
        })
        break
      case 'link':
        nodes.push({
          type: 'text',
          text: m[1],
          marks: [{ type: 'link', attrs: { href: m[2] } }],
        })
        break
    }

    remaining = remaining.slice(earliest.index + m[0].length)
  }

  return nodes
}

// ─── Tiptap JSON → Raw text ───────────────────────────────────────

/** Convert a Tiptap JSON document back to our raw body format. */
export function fromTiptapDoc(doc: JSONContent): string {
  if (!doc.content) return ''
  return serializeNodes(doc.content).replace(/\n+$/, '')
}

function serializeNodes(nodes: JSONContent[]): string {
  let result = ''

  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        result += serializeInline(node.content ?? []) + '\n'
        break

      case 'bulletList':
        for (const item of node.content ?? []) {
          const itemText = serializeListItem(item)
          result += `- ${itemText}\n`
        }
        break

      case 'orderedList':
        let num = 1
        for (const item of node.content ?? []) {
          const itemText = serializeListItem(item)
          result += `${num}. ${itemText}\n`
          num++
        }
        break

      case 'hardBreak':
        result += '\n'
        break

      default:
        // Unknown block node — try to serialize inline content
        if (node.content) {
          result += serializeInline(node.content) + '\n'
        }
        break
    }
  }

  return result
}

function serializeListItem(item: JSONContent): string {
  // listItem wraps paragraph(s) — extract first paragraph's inline content
  const para = item.content?.find((c) => c.type === 'paragraph')
  if (para) {
    return serializeInline(para.content ?? [])
  }
  return serializeInline(item.content ?? [])
}

function serializeInline(nodes: JSONContent[]): string {
  let result = ''

  for (const node of nodes) {
    if (node.type === 'text') {
      result += serializeTextWithMarks(node)
    } else if (node.type === 'mention') {
      const label = node.attrs?.label ?? ''
      const id = node.attrs?.id ?? ''
      result += `@[${label}](${id})`
    } else if (node.type === 'image') {
      const inlineId = node.attrs?.['data-inline-id'] ?? ''
      result += `![](${inlineId})`
    } else if (node.type === 'fileLink') {
      const fileName = node.attrs?.fileName ?? ''
      const id = node.attrs?.id ?? ''
      result += `%[${fileName}](${id})`
    } else if (node.type === 'hardBreak') {
      result += '\n'
    }
  }

  return result
}

function serializeTextWithMarks(node: JSONContent): string {
  let text = node.text ?? ''
  const marks = node.marks ?? []

  // Check for link mark first (wraps text differently)
  const linkMark = marks.find((m) => m.type === 'link')
  if (linkMark) {
    text = `[${text}](${linkMark.attrs?.href ?? ''})`
  }

  // Apply inline formatting marks
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        text = `**${text}**`
        break
      case 'italic':
        text = `*${text}*`
        break
      case 'strike':
        text = `~~${text}~~`
        break
      case 'code':
        text = `\`${text}\``
        break
      // link handled above
    }
  }

  return text
}
