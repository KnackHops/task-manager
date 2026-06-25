import type { ProjectMemberWithProfile } from '@/types/database'

// Format: @[Display Name](user_uuid)
export const MENTION_REGEX = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g

// Format: ![](attachment_uuid)
export const IMAGE_REGEX = /!\[\]\(([0-9a-f-]{36})\)/g

// Format: %[filename.ext](attachment_uuid)
export const FILE_LINK_REGEX = /%\[([^\]]+)\]\(([0-9a-f-]{36})\)/g

export function encodeMention(member: ProjectMemberWithProfile): string {
  return `@[${member.profile.full_name}](${member.user_id})`
}

/** First whitespace-separated word of a full name */
export function getFirstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName
}

export type BodySegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; name: string; userId: string }
  | { type: 'image'; attachmentId: string }
  | { type: 'file_link'; fileName: string; attachmentId: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'list'; ordered: boolean; items: BodySegment[][] }

// Inline formatting regexes (non-global, used for first-match scanning)
const BOLD_RE = /\*\*(.+?)\*\*/
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/
const STRIKE_RE = /~~(.+?)~~/
const CODE_RE = /`([^`]+)`/
// Links that are NOT mentions/images/file_links (negative lookbehind for !, %, @)
const LINK_RE = /(?<![!%@])\[([^\]]+)\]\(([^)]+)\)/

const INLINE_FORMAT_PATTERNS = [
  { re: BOLD_RE, type: 'bold' as const },
  { re: STRIKE_RE, type: 'strike' as const },
  { re: CODE_RE, type: 'code' as const },
  { re: LINK_RE, type: 'link' as const },
  { re: ITALIC_RE, type: 'italic' as const },
]

/** Parse inline formatting within a plain text chunk (no mentions/images/file_links). */
function parseInlineFormatting(text: string): BodySegment[] {
  const segments: BodySegment[] = []
  let remaining = text

  while (remaining.length > 0) {
    let earliest: { index: number; match: RegExpExecArray; type: string } | null = null

    for (const pattern of INLINE_FORMAT_PATTERNS) {
      const re = new RegExp(pattern.re.source, pattern.re.flags)
      const m = re.exec(remaining)
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m, type: pattern.type }
      }
    }

    if (!earliest) {
      segments.push({ type: 'text', value: remaining })
      break
    }

    if (earliest.index > 0) {
      segments.push({ type: 'text', value: remaining.slice(0, earliest.index) })
    }

    const m = earliest.match
    switch (earliest.type) {
      case 'bold':
        segments.push({ type: 'bold', value: m[1]! })
        break
      case 'italic':
        segments.push({ type: 'italic', value: m[1]! })
        break
      case 'strike':
        segments.push({ type: 'strike', value: m[1]! })
        break
      case 'code':
        segments.push({ type: 'code', value: m[1]! })
        break
      case 'link':
        segments.push({ type: 'link', text: m[1]!, href: m[2]! })
        break
    }

    remaining = remaining.slice(earliest.index + m[0].length)
  }

  return segments
}

/** Parse a text string for mentions, images, file_links, and inline formatting. */
function parseInlineText(text: string): BodySegment[] {
  type MatchInfo =
    | { type: 'mention'; index: number; length: number; name: string; userId: string }
    | { type: 'image'; index: number; length: number; attachmentId: string }
    | { type: 'file_link'; index: number; length: number; fileName: string; attachmentId: string }

  const matches: MatchInfo[] = []
  const mentionRe = new RegExp(MENTION_REGEX.source, 'g')
  const imageRe = new RegExp(IMAGE_REGEX.source, 'g')
  const fileLinkRe = new RegExp(FILE_LINK_REGEX.source, 'g')
  let m: RegExpExecArray | null

  while ((m = mentionRe.exec(text)) !== null) {
    matches.push({ type: 'mention', index: m.index, length: m[0].length, name: m[1]!, userId: m[2]! })
  }
  while ((m = imageRe.exec(text)) !== null) {
    matches.push({ type: 'image', index: m.index, length: m[0].length, attachmentId: m[1]! })
  }
  while ((m = fileLinkRe.exec(text)) !== null) {
    matches.push({ type: 'file_link', index: m.index, length: m[0].length, fileName: m[1]!, attachmentId: m[2]! })
  }

  matches.sort((a, b) => a.index - b.index)

  const segments: BodySegment[] = []
  let lastIndex = 0
  for (const match of matches) {
    if (match.index > lastIndex) {
      segments.push(...parseInlineFormatting(text.slice(lastIndex, match.index)))
    }
    if (match.type === 'mention') {
      segments.push({ type: 'mention', name: match.name, userId: match.userId })
    } else if (match.type === 'image') {
      segments.push({ type: 'image', attachmentId: match.attachmentId })
    } else {
      segments.push({ type: 'file_link', fileName: match.fileName, attachmentId: match.attachmentId })
    }
    lastIndex = match.index + match.length
  }

  if (lastIndex < text.length) {
    segments.push(...parseInlineFormatting(text.slice(lastIndex)))
  }

  return segments
}

export function parseBody(body: string): BodySegment[] {
  // First pass: extract list blocks
  const lines = body.split('\n')
  const blocks: Array<{ type: 'list'; ordered: boolean; items: string[] } | { type: 'text'; value: string }> = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Bullet list block
    if (/^- /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^- /.test(lines[i]!)) {
        items.push(lines[i]!.slice(2))
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // Ordered list block
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\. /, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // Accumulate text lines
    const lastBlock = blocks[blocks.length - 1]
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.value += '\n' + line
    } else {
      blocks.push({ type: 'text', value: line })
    }
    i++
  }

  // Second pass: parse each block
  const segments: BodySegment[] = []

  for (const block of blocks) {
    if (block.type === 'list') {
      segments.push({
        type: 'list',
        ordered: block.ordered,
        items: block.items.map((item) => parseInlineText(item)),
      })
      continue
    }

    segments.push(...parseInlineText(block.value))
  }

  return segments
}

export function filterMembers(
  members: ProjectMemberWithProfile[],
  query: string
): ProjectMemberWithProfile[] {
  const q = query.toLowerCase()
  return members.filter(
    (m) =>
      m.profile.full_name.toLowerCase().includes(q) ||
      m.profile.email.toLowerCase().includes(q)
  )
}
