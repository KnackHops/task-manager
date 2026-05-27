import { useState } from 'react'
import { getSignedUrl } from '@/services/attachments'
import type { AttachmentWithUploader } from '@/types/database'

interface InlineCommentImageProps {
  attachmentId: string
  attachments: AttachmentWithUploader[]
}

export function InlineCommentImage({
  attachmentId,
  attachments,
}: InlineCommentImageProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  const attachment = attachments.find((a) => a.id === attachmentId)
  if (!attachment) return null

  // Load signed URL on first render
  if (!url && !loading) {
    setLoading(true)
    getSignedUrl(attachment.storage_path).then((signedUrl) => {
      setUrl(signedUrl)
      setLoading(false)
    })
  }

  if (!url) {
    return (
      <span className="inline-block my-1 h-32 w-48 animate-pulse rounded-lg bg-muted" />
    )
  }

  return (
    <>
      <img
        src={url}
        alt={attachment.file_name}
        onClick={() => setLightbox(true)}
        className="my-1 max-w-sm max-h-64 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity block"
      />
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(false)}
        >
          <img
            src={url}
            alt={attachment.file_name}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  )
}
