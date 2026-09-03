import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
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
/** Zoom bounds plus the step used by the buttons and keyboard. */
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.4
/** Zoom level a double-click jumps to. */
const DOUBLE_CLICK_ZOOM = 2.5

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export function ImageLightbox({ images, startIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0))
  )
  const [urls, setUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef(urls)
  urlsRef.current = urls
  const pendingRef = useRef<Set<string>>(new Set())
  const thumbStripRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null
  )
  const [dragging, setDragging] = useState(false)

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

  const resetZoom = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  /**
   * Zoom to `next`, keeping the point under `focal` (relative to the stage
   * centre) anchored. Omit `focal` to zoom around the centre.
   */
  const zoomTo = useCallback((next: number, focal?: { x: number; y: number }) => {
    setZoom((prev) => {
      const target = clampZoom(next)
      if (target === prev) return prev
      const ratio = target / prev
      setOffset((prevOffset) => {
        if (target === MIN_ZOOM) return { x: 0, y: 0 }
        const fx = focal?.x ?? 0
        const fy = focal?.y ?? 0
        return {
          x: fx - (fx - prevOffset.x) * ratio,
          y: fy - (fy - prevOffset.y) * ratio,
        }
      })
      return target
    })
  }, [])

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return
      setIndex((prev) => (prev + delta + count) % count)
    },
    [count]
  )

  // Start each slide unzoomed
  useEffect(() => {
    resetZoom()
  }, [index, resetZoom])

  // Wheel / trackpad pinch zoom, anchored on the pointer
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = stage.getBoundingClientRect()
      zoomTo(zoomRef.current * Math.exp(-e.deltaY / 300), {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') zoomTo(zoomRef.current * ZOOM_STEP)
      else if (e.key === '-' || e.key === '_') zoomTo(zoomRef.current / ZOOM_STEP)
      else if (e.key === '0') resetZoom()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose, zoomTo, resetZoom])

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
          onClick={() => zoomTo(zoom / ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={resetZoom}
          disabled={zoom === MIN_ZOOM}
          className="min-w-[3.5rem] rounded-md px-2 py-1 text-xs tabular-nums text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => zoomTo(zoom * ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
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
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2"
      >
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
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (zoom > MIN_ZOOM) {
                resetZoom()
                return
              }
              const rect = stageRef.current?.getBoundingClientRect()
              zoomTo(
                DOUBLE_CLICK_ZOOM,
                rect
                  ? {
                      x: e.clientX - rect.left - rect.width / 2,
                      y: e.clientY - rect.top - rect.height / 2,
                    }
                  : undefined
              )
            }}
            onPointerDown={(e) => {
              if (zoom <= MIN_ZOOM) return
              e.stopPropagation()
              e.preventDefault()
              e.currentTarget.setPointerCapture(e.pointerId)
              dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                originX: offset.x,
                originY: offset.y,
              }
              setDragging(true)
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current
              if (!drag) return
              setOffset({
                x: drag.originX + (e.clientX - drag.startX),
                y: drag.originY + (e.clientY - drag.startY),
              })
            }}
            onPointerUp={(e) => {
              if (!dragRef.current) return
              e.currentTarget.releasePointerCapture(e.pointerId)
              dragRef.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              dragRef.current = null
              setDragging(false)
            }}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
              transition: dragging ? 'none' : 'transform 150ms ease-out',
            }}
            className={`max-h-full max-w-full rounded-lg object-contain ${
              zoom > MIN_ZOOM
                ? dragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-zoom-in'
            }`}
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
