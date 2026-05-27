export const FILE_SIZE_LIMIT = 50 * 1024 * 1024 // 50 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageType(fileType: string): boolean {
  return fileType.startsWith('image/')
}

export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

/** Extract file objects from a paste/drop clipboard event */
export function extractClipboardFiles(
  e: ClipboardEvent | React.ClipboardEvent
): File[] {
  const files: File[] = []
  const items = e.clipboardData?.items
  if (!items) return files
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}
