import { useState } from 'react'
import { Download, Trash2, FileText, FileArchive, FileImage, File, GripVertical } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatFileSize, isImageType, getFileExtension } from '@/lib/file-utils'
import { getSignedUrl } from '@/services/attachments'
import { formatDistanceToNow } from 'date-fns'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import type { AttachmentWithUploader } from '@/types/database'

interface AttachmentItemProps {
  attachment: AttachmentWithUploader
  canDelete: boolean
  onDelete: (id: string, storagePath: string) => void
  compact?: boolean
  grid?: boolean
  dragHandleProps?: DraggableProvidedDragHandleProps | null
}

function FileIcon({ fileType, fileName }: { fileType: string; fileName: string }) {
  const ext = getFileExtension(fileName)
  if (isImageType(fileType)) return <FileImage className="h-4 w-4" />
  if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz')
    return <FileArchive className="h-4 w-4" />
  if (ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'txt')
    return <FileText className="h-4 w-4" />
  return <File className="h-4 w-4" />
}

export function AttachmentItem({
  attachment,
  canDelete,
  onDelete,
  compact = false,
  grid = false,
  dragHandleProps,
}: AttachmentItemProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const isImage = isImageType(attachment.file_type)

  const loadUrl = async () => {
    if (imageUrl) return imageUrl
    setLoadingUrl(true)
    try {
      const url = await getSignedUrl(attachment.storage_path)
      setImageUrl(url)
      return url
    } finally {
      setLoadingUrl(false)
    }
  }

  const handleDownload = async () => {
    const url = await loadUrl()
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.file_name
      a.click()
    }
  }

  const handlePreview = async () => {
    await loadUrl()
    setLightbox(true)
  }

  // Load image thumbnail on mount
  if (isImage && !imageUrl && !loadingUrl) {
    loadUrl()
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/attachment-json',
      JSON.stringify({
        id: attachment.id,
        fileName: attachment.file_name,
        fileType: attachment.file_type,
        fileSize: attachment.file_size,
        storagePath: attachment.storage_path,
      })
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  if (grid) {
    return (
      <>
        <div
          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
          draggable
          onDragStart={handleDragStart}
          title={attachment.file_name}
        >
          <button
            onClick={isImage ? handlePreview : handleDownload}
            className="flex h-full w-full items-center justify-center text-muted-foreground"
          >
            {isImage && imageUrl ? (
              <img src={imageUrl} alt={attachment.file_name} className="h-full w-full object-cover" />
            ) : (
              <FileIcon fileType={attachment.file_type} fileName={attachment.file_name} />
            )}
          </button>
          {canDelete && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="absolute right-0.5 top-0.5 rounded bg-background/70 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        <ConfirmDialog
          open={deleteConfirm}
          onClose={() => setDeleteConfirm(false)}
          onConfirm={() => {
            onDelete(attachment.id, attachment.storage_path)
            setDeleteConfirm(false)
          }}
          title="Delete attachment"
          description={`Delete "${attachment.file_name}"? This cannot be undone.`}
          confirmLabel="Delete"
        />

        {lightbox && imageUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
            onClick={() => setLightbox(false)}
          >
            <img
              src={imageUrl}
              alt={attachment.file_name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        )}
      </>
    )
  }

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/60 hover:border-primary/30 transition-colors"
        draggable
        onDragStart={handleDragStart}
      >
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        <FileIcon fileType={attachment.file_type} fileName={attachment.file_name} />
        <span className="truncate max-w-[120px] text-foreground">{attachment.file_name}</span>
        <span className="text-muted-foreground">{formatFileSize(attachment.file_size)}</span>
        <button onClick={handleDownload} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
          <Download className="h-3 w-3" />
        </button>
        {canDelete && (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <ConfirmDialog
          open={deleteConfirm}
          onClose={() => setDeleteConfirm(false)}
          onConfirm={() => {
            onDelete(attachment.id, attachment.storage_path)
            setDeleteConfirm(false)
          }}
          title="Delete attachment"
          description={`Delete "${attachment.file_name}"? This cannot be undone.`}
          confirmLabel="Delete"
        />
      </div>
    )
  }

  return (
    <>
      <div
        className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2 cursor-pointer hover:border-primary/30 hover:bg-accent/50 transition-colors"
        draggable
        onDragStart={handleDragStart}
      >
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        {isImage && imageUrl ? (
          <button
            onClick={handlePreview}
            className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted"
          >
            <img
              src={imageUrl}
              alt={attachment.file_name}
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileIcon fileType={attachment.file_type} fileName={attachment.file_name} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {attachment.file_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(attachment.file_size)} &middot;{' '}
            {attachment.uploader?.full_name ?? 'Deleted User'} &middot;{' '}
            {formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true })}
          </p>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDownload}
            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
          {canDelete && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => {
          onDelete(attachment.id, attachment.storage_path)
          setDeleteConfirm(false)
        }}
        title="Delete attachment"
        description={`Delete "${attachment.file_name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />

      {/* Lightbox */}
      {lightbox && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(false)}
        >
          <img
            src={imageUrl}
            alt={attachment.file_name}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  )
}
