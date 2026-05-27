import { useState } from 'react'
import { FileText } from 'lucide-react'
import { getSignedUrl } from '@/services/attachments'
import type { AttachmentWithUploader } from '@/types/database'

interface InlineFileLinkProps {
  attachmentId: string
  fileName: string
  attachments: AttachmentWithUploader[]
}

export function InlineFileLink({
  attachmentId,
  fileName,
  attachments,
}: InlineFileLinkProps) {
  const [downloading, setDownloading] = useState(false)
  const attachment = attachments.find((a) => a.id === attachmentId)
  if (!attachment)
    return (
      <span className="text-xs text-muted-foreground">[file not found]</span>
    )

  const handleClick = async () => {
    setDownloading(true)
    try {
      const url = await getSignedUrl(attachment.storage_path)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.file_name
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={downloading}
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-50"
    >
      <FileText className="h-3 w-3" />
      {fileName}
    </button>
  )
}
