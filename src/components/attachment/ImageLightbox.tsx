import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, ImageIcon, Loader2, X } from 'lucide-react'
import { getSignedUrl } from '@/services/attachments'
import { formatFileSize } from '@/lib/file-utils'
import type { AttachmentWithUploader } from '@/types/database'

interface ImageLightboxProps {
  /** Image attachments to page through, in display order. */
  images: AttachmentWithUploader[]
  startIndex: number
  onClose: () => void
}

/** How many neighbours around the current slide get a signed URL up front. */
const PREFETCH_RADIUS = 2
/** Thumbnails within this distance of the current slide get a signed URL. */
const THUMB_RADIUS = 6

export function ImageLightbox({ images, startIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0))
  )
  const [urls, setUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef(urls)
  urlsRef.current = urls
  const pendingRef = useRef<Set<string>>(new Set())
  const thumbStripRef = useRef<HTMLDivElement>(null)

  const count = images.length
  const current = images[index]
  const currentUrl = current ? urls[current.id] : undefined

  const ensureUrl = useCallback((attachment: AttachmentWithUploader | undefined) => {
    if (!attachment) return
    if (urlsRef.current[attachment.id] || pendingRef.current.has(attachment.id)) return
    pendingRef.current.add(attachment.id)
    getSignedUrl(attachment.storage_path)
      .then((url) => setUrls((prev) => ({ ...prev, [attachment.id]: url })))
      .catch(() => {})
      .finally(() => pendingRef.current.delete(attachment.id))
  }, [])

  // Resolve the current slide plus its neighbours so paging feels instant
  useEffect(() => {
    for (let offset = 0; offset <= PREFETCH_RADIUS; offset++) {
      ensureUrl(images[index + offset])
      ensureUrl(images[index - offset])
    }
  }, [index, images, ensureUrl])

  // Resolve thumbnails near the current slide
  useEffect(() => {
    if (count < 2) return
    const from = Math.max(0, index - THUMB_RADIUS)
    const to = Math.min(count - 1, index + THUMB_RADIUS)
    for (let i = from; i <= to; i++) ensureUrl(images[i])
  }, [index, images, count, ensureUrl])

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return
      setIndex((prev) => (prev + delta + count) % count)
    },
    [count]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Lock background scroll while open
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Keep the active thumbnail in view
  useEffect(() => {
    const strip = thumbStripRef.current
    if (!strip) return
    const active = strip.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])

  const handleDownload = async () => {
    if (!current) return
    const url = urls[current.id] ?? (await getSignedUrl(current.storage_path))
    const a = document.createElement('a')
    a.href = url
    a.download = current.file_name
    a.click()
  }

  if (!current) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.file_name}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{current.file_name}</p>
          <p className="text-xs text-white/60">
            {formatFileSize(current.file_size)}
            {count > 1 && ` · ${index + 1} of ${count}`}
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Download"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
        {count > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white/80 hover:bg-black/70 hover:text-white transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {currentUrl ? (
          <img
            key={current.id}
            src={currentUrl}
            alt={current.file_name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        )}

        {count > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white/80 hover:bg-black/70 hover:text-white transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div
          ref={thumbStripRef}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 gap-2 overflow-x-auto px-4 py-3"
        >
          {images.map((img, i) => {
            const thumbUrl = urls[img.id]
            const active = i === index
            return (
              <button
                key={img.id}
                data-active={active}
                onClick={() => setIndex(i)}
                title={img.file_name}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                  active ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-white/10 text-white/40">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body
  )
}
