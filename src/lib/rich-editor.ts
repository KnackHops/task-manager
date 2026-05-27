/**
 * Shared contentEditable utilities for rich text editing.
 * Used by CommentForm, CommentItem edit mode, and TaskDetailPanel description edit.
 * Pure DOM functions — no React hooks.
 */

import { parseBody, getFirstName } from '@/lib/mentions'
import { getSignedUrl } from '@/services/attachments'
import { isImageType } from '@/lib/file-utils'

// Data attribute constants
export const MENTION_ATTR = 'data-mention'
export const INLINE_IMG_ATTR = 'data-inline-id'
export const INLINE_FILE_ATTR = 'data-file-link-id'

// ─── Extract raw body ───────────────────────────────────────────────

/** Walk contentEditable DOM → raw body string.
 *  mention spans → @[Name](uuid)
 *  inline images → ![](uuid)
 *  file-link spans → %[filename](uuid)
 */
const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

export function extractRawBody(el: HTMLElement): string {
  let result = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width spaces inserted as cursor anchors
      result += (node.textContent ?? '').replace(/\u200B/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement
      if (elem.hasAttribute(MENTION_ATTR)) {
        const fullName = elem.getAttribute('data-full-name') ?? ''
        const userId = elem.getAttribute('data-user-id') ?? ''
        result += `@[${fullName}](${userId})`
      } else if (elem.tagName === 'IMG' && elem.hasAttribute(INLINE_IMG_ATTR)) {
        const inlineId = elem.getAttribute(INLINE_IMG_ATTR) ?? ''
        result += `![](${inlineId})`
      } else if (elem.hasAttribute(INLINE_FILE_ATTR)) {
        const attachId = elem.getAttribute(INLINE_FILE_ATTR) ?? ''
        const fileName = elem.getAttribute('data-file-name') ?? ''
        result += `%[${fileName}](${attachId})`
      } else if (elem.tagName === 'BR') {
        result += '\n'
      } else if (BLOCK_TAGS.has(elem.tagName)) {
        // Block elements: add newline before content (unless at start)
        if (result.length > 0 && !result.endsWith('\n')) {
          result += '\n'
        }
        result += extractRawBody(elem)
      } else {
        result += extractRawBody(elem)
      }
    }
  }
  return result
}

// ─── Cursor helpers ─────────────────────────────────────────────────

/** Get plain text before cursor in contentEditable */
export function getTextBeforeCursor(): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  let container = range.startContainer as HTMLElement | null
  while (container && !container.hasAttribute?.('contenteditable')) {
    container = container.parentElement
  }
  if (!container) return ''
  preRange.selectNodeContents(container)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString()
}

// ─── Element creation ───────────────────────────────────────────────

/** Create a mention span element */
export function createMentionSpan(member: {
  user_id: string
  profile: { full_name: string; email: string }
}): HTMLSpanElement {
  const span = document.createElement('span')
  span.setAttribute(MENTION_ATTR, 'true')
  span.setAttribute('data-user-id', member.user_id)
  span.setAttribute('data-full-name', member.profile.full_name)
  span.setAttribute('data-email', member.profile.email)
  span.contentEditable = 'false'
  span.className =
    'inline rounded bg-primary/20 px-0.5 text-primary font-medium'
  span.textContent = `@${getFirstName(member.profile.full_name)}`
  return span
}

// ─── Special element detection ──────────────────────────────────────

/** Check if a node is a special non-editable element (mention, inline image, or file link) */
export function isSpecialElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as HTMLElement
  return (
    el.hasAttribute?.(MENTION_ATTR) ||
    (el.tagName === 'IMG' && el.hasAttribute?.(INLINE_IMG_ATTR)) ||
    el.hasAttribute?.(INLINE_FILE_ATTR)
  )
}

// ─── Inline insertion at cursor ─────────────────────────────────────

/** Insert a pasted image file inline at cursor. Returns the temp ID. */
export function insertPastedImage(
  file: File,
  inlineImagesRef: Map<string, File>
): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''

  const range = sel.getRangeAt(0)
  range.deleteContents()

  const tempId = `temp-${crypto.randomUUID()}`
  inlineImagesRef.set(tempId, file)

  const img = document.createElement('img')
  img.setAttribute(INLINE_IMG_ATTR, tempId)
  img.src = URL.createObjectURL(file)
  img.className =
    'max-w-full max-h-48 rounded-lg border border-border my-1 block'
  img.contentEditable = 'false'

  range.insertNode(img)
  range.collapse(false)

  const space = document.createTextNode('\u00A0')
  img.after(space)
  range.setStartAfter(space)
  range.setEndAfter(space)

  sel.removeAllRanges()
  sel.addRange(range)

  return tempId
}

/** Insert an existing image attachment inline at cursor (no re-upload). */
export function insertInlineImageAtCursor(
  attachmentId: string,
  signedUrl: string
): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const img = document.createElement('img')
  img.setAttribute(INLINE_IMG_ATTR, attachmentId)
  img.src = signedUrl
  img.className =
    'max-w-full max-h-48 rounded-lg border border-border my-1 block'
  img.contentEditable = 'false'

  range.insertNode(img)
  const space = document.createTextNode('\u00A0')
  img.after(space)
  range.setStartAfter(space)
  range.setEndAfter(space)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Insert a file link span at cursor for non-image attachments. */
export function insertFileLinkAtCursor(
  attachmentId: string,
  fileName: string
): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const span = document.createElement('span')
  span.setAttribute(INLINE_FILE_ATTR, attachmentId)
  span.setAttribute('data-file-name', fileName)
  span.contentEditable = 'false'
  span.className =
    'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary cursor-default'
  span.textContent = `📎 ${fileName}`

  range.insertNode(span)
  const space = document.createTextNode('\u00A0')
  span.after(space)
  range.setStartAfter(space)
  range.setEndAfter(space)
  sel.removeAllRanges()
  sel.addRange(range)
}

// ─── Backspace handling ─────────────────────────────────────────────

/**
 * Handle backspace in contentEditable to delete special elements.
 * Returns true if the event was handled (caller should checkEmpty + preventDefault).
 */
export function handleEditorBackspace(
  e: KeyboardEvent | React.KeyboardEvent,
  inlineImagesRef?: Map<string, File>
): boolean {
  if (e.key !== 'Backspace') return false

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false

  const { startContainer, startOffset } = range

  // Case 1: cursor in text node at offset 0, previous sibling is special
  if (
    startContainer.nodeType === Node.TEXT_NODE &&
    startOffset === 0 &&
    startContainer.previousSibling
  ) {
    const prev = startContainer.previousSibling as HTMLElement
    if (isSpecialElement(prev)) {
      e.preventDefault()
      if (prev.tagName === 'IMG' && inlineImagesRef) {
        const tempId = prev.getAttribute(INLINE_IMG_ATTR)
        if (tempId) inlineImagesRef.delete(tempId)
      }
      prev.remove()
      return true
    }
  }

  // Case 2: cursor in element at an offset, child before offset is special
  if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
    const child = startContainer.childNodes[startOffset - 1] as
      | HTMLElement
      | undefined
    if (child && isSpecialElement(child)) {
      e.preventDefault()
      if (child.tagName === 'IMG' && inlineImagesRef) {
        const tempId = child.getAttribute(INLINE_IMG_ATTR)
        if (tempId) inlineImagesRef.delete(tempId)
      }
      child.remove()
      return true
    }
  }

  return false
}

// ─── Populate editor from existing body ─────────────────────────────

/**
 * Populate a contentEditable element from a raw body string.
 * Parses body into segments and builds DOM nodes.
 * Fetches signed URLs for inline images in parallel.
 */
export async function populateEditorFromBody(
  el: HTMLElement,
  body: string,
  attachments: Array<{
    id: string
    storage_path: string
    file_name: string
    file_type: string
  }>,
  memberMap: Map<string, { fullName: string; email: string }>
): Promise<void> {
  el.innerHTML = ''
  const segments = parseBody(body)

  // Pre-fetch signed URLs for all inline images in parallel
  const urlMap = new Map<string, string>()
  const imageSegments = segments.filter((s) => s.type === 'image')
  await Promise.all(
    imageSegments.map(async (seg) => {
      if (seg.type !== 'image') return
      const att = attachments.find((a) => a.id === seg.attachmentId)
      if (att) {
        try {
          const url = await getSignedUrl(att.storage_path)
          urlMap.set(seg.attachmentId, url)
        } catch {
          // Skip broken images
        }
      }
    })
  )

  // Build DOM synchronously
  for (const seg of segments) {
    if (seg.type === 'text') {
      const lines = seg.value.split('\n')
      lines.forEach((line, i) => {
        if (line) el.appendChild(document.createTextNode(line))
        if (i < lines.length - 1) el.appendChild(document.createElement('br'))
      })
    } else if (seg.type === 'mention') {
      const info = memberMap.get(seg.userId)
      const span = document.createElement('span')
      span.setAttribute(MENTION_ATTR, 'true')
      span.setAttribute('data-user-id', seg.userId)
      span.setAttribute('data-full-name', info?.fullName ?? seg.name)
      span.setAttribute('data-email', info?.email ?? '')
      span.contentEditable = 'false'
      span.className =
        'inline rounded bg-primary/20 px-0.5 text-primary font-medium'
      span.textContent = `@${getFirstName(info?.fullName ?? seg.name)}`
      el.appendChild(span)
    } else if (seg.type === 'image') {
      const signedUrl = urlMap.get(seg.attachmentId)
      if (signedUrl) {
        const img = document.createElement('img')
        img.setAttribute(INLINE_IMG_ATTR, seg.attachmentId)
        img.src = signedUrl
        img.className =
          'max-w-full max-h-48 rounded-lg border border-border my-1 block'
        img.contentEditable = 'false'
        el.appendChild(img)
      }
    } else if (seg.type === 'file_link') {
      const span = document.createElement('span')
      span.setAttribute(INLINE_FILE_ATTR, seg.attachmentId)
      span.setAttribute('data-file-name', seg.fileName)
      span.contentEditable = 'false'
      span.className =
        'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary cursor-default'
      span.textContent = `📎 ${seg.fileName}`
      el.appendChild(span)
    }
  }

  // Ensure trailing space so cursor can land after last element
  el.appendChild(document.createTextNode('\u200B'))
}

// ─── Drag-and-drop from attachment list ─────────────────────────────

export interface AttachmentDropData {
  id: string
  fileName: string
  fileType: string
  storagePath: string
}

/** Parse attachment data from a drag event's dataTransfer. Returns null if not an attachment drop. */
export function parseAttachmentDrop(
  e: DragEvent | React.DragEvent
): AttachmentDropData | null {
  const json = e.dataTransfer?.getData('application/attachment-json')
  if (!json) return null
  try {
    return JSON.parse(json) as AttachmentDropData
  } catch {
    return null
  }
}

/** Handle drop of an attachment onto an editor. Returns true if handled. */
export async function handleAttachmentDrop(
  e: React.DragEvent,
  checkEmpty: () => void
): Promise<boolean> {
  const attData = parseAttachmentDrop(e)
  if (!attData) return false
  e.preventDefault()

  if (isImageType(attData.fileType)) {
    const signedUrl = await getSignedUrl(attData.storagePath)
    insertInlineImageAtCursor(attData.id, signedUrl)
  } else {
    insertFileLinkAtCursor(attData.id, attData.fileName)
  }
  checkEmpty()
  return true
}
