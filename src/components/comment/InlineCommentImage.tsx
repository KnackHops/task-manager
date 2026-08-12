import { useMemo, useState } from 'react'
import { getSignedUrl } from '@/services/attachments'
import { isImageType } from '@/lib/file-utils'
import { ImageLightbox } from '@/components/attachment/ImageLightbox'
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

  // Clicking one inline image pages through every image in the same set
  const images = useMemo(
    () => attachments.filter((a) => isImageType(a.file_type)),
    [attachments]
  )
  const startIndex = images.findIndex((a) => a.id === attachmentId)

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
        <ImageLightbox
          images={images.length > 0 ? images : [attachment]}
          startIndex={Math.max(startIndex, 0)}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}
