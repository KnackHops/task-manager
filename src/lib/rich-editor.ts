/**
 * Shared drag-and-drop utilities for attachment handling.
 */

export interface AttachmentDropData {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
}

/** Replace an inline temp ID with a real attachment ID in serialized body text. */
export function replaceInlineTempId(
  body: string,
  tempId: string,
  realId: string,
  fileName: string,
): string {
  if (body.includes(`![](${tempId})`)) {
    return body.replace(`![](${tempId})`, `![](${realId})`)
  }
  return body.replace(
    new RegExp(`%\\[[^\\]]*\\]\\(${tempId}\\)`),
    `%[${fileName}](${realId})`,
  )
}

/** Remove an inline temp ID from serialized body text (on upload failure). */
export function removeInlineTempId(body: string, tempId: string): string {
  if (body.includes(`![](${tempId})`)) {
    return body.replace(`![](${tempId})`, '')
  }
  return body.replace(new RegExp(`%\\[[^\\]]*\\]\\(${tempId}\\)`), '')
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
