import { useState, useEffect } from 'react'
import { Paperclip, X } from 'lucide-react'

// Preview tile for a not-yet-uploaded file (local File → object URL).
export function StagedFileTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/')
  const [url, setUrl] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (!isImage) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, isImage])

  return (
    <>
      <div
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
        title={file.name}
      >
        {isImage && url ? (
          <button type="button" onClick={() => setLightbox(true)} className="h-full w-full">
            <img src={url} alt={file.name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            <span className="w-full truncate text-center text-[10px]">{file.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-0.5 top-0.5 rounded bg-background/70 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {lightbox && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(false)}
        >
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  )
}
