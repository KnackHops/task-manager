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

export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = []

  // Collect all matches (mentions + images) sorted by position
  const matches: Array<
    | { type: 'mention'; index: number; length: number; name: string; userId: string }
    | { type: 'image'; index: number; length: number; attachmentId: string }
    | { type: 'file_link'; index: number; length: number; fileName: string; attachmentId: string }
  > = []

  const mentionRe = new RegExp(MENTION_REGEX.source, 'g')
  const imageRe = new RegExp(IMAGE_REGEX.source, 'g')
  const fileLinkRe = new RegExp(FILE_LINK_REGEX.source, 'g')
  let m: RegExpExecArray | null

  while ((m = mentionRe.exec(body)) !== null) {
    matches.push({ type: 'mention', index: m.index, length: m[0].length, name: m[1]!, userId: m[2]! })
  }
  while ((m = imageRe.exec(body)) !== null) {
    matches.push({ type: 'image', index: m.index, length: m[0].length, attachmentId: m[1]! })
  }
  while ((m = fileLinkRe.exec(body)) !== null) {
    matches.push({ type: 'file_link', index: m.index, length: m[0].length, fileName: m[1]!, attachmentId: m[2]! })
  }

  matches.sort((a, b) => a.index - b.index)

  let lastIndex = 0
  for (const match of matches) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: body.slice(lastIndex, match.index) })
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

  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) })
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
