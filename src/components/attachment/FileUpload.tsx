import { useState, useRef, useCallback } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useUploadAttachment, attachmentKeys } from '@/hooks/useAttachments'
import { useQueryClient } from '@tanstack/react-query'
import { FILE_SIZE_LIMIT, formatFileSize } from '@/lib/file-utils'
import { parseAttachmentDrop } from '@/lib/rich-editor'
import { copyAttachment } from '@/services/attachments'

interface FileUploadProps {
  taskId?: string
  commentId?: string
}

export function FileUpload({ taskId, commentId }: FileUploadProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const upload = useUploadAttachment(taskId)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!user) return
      const target = taskId
        ? { taskId }
        : commentId
          ? { commentId }
          : null
      if (!target) return

      const fileArray = Array.from(files)
      const oversized = fileArray.filter((f) => f.size > FILE_SIZE_LIMIT)
      if (oversized.length > 0) {
        toast.error(
          `File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${oversized.map((f) => f.name).join(', ')}`
        )
      }

      const valid = fileArray.filter((f) => f.size <= FILE_SIZE_LIMIT)
      for (const file of valid) {
        setUploading((prev) => [...prev, file.name])
        try {
          await upload.mutateAsync({
            file,
            uploadedBy: user.id,
            target,
          })
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
          setUploading((prev) => prev.filter((n) => n !== file.name))
        }
      }
    },
    [user, taskId, commentId, upload]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)

      // Check for existing attachment drag (application/attachment-json)
      const attData = parseAttachmentDrop(e)
      if (attData && user) {
        const target = taskId
          ? { taskId }
          : commentId
            ? { commentId }
            : null
        if (!target) return

        setUploading((prev) => [...prev, attData.fileName])
        try {
          await copyAttachment(
            attData.storagePath,
            user.id,
            attData.fileName,
            attData.fileType,
            attData.fileSize ?? 0,
            target,
          )
          if (taskId) {
            await queryClient.invalidateQueries({ queryKey: attachmentKeys.task(taskId) })
          } else if (commentId) {
            await queryClient.invalidateQueries({ queryKey: attachmentKeys.comment(commentId) })
          }
        } catch (err) {
          toast.error(`Failed to copy ${attData.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
          setUploading((prev) => prev.filter((n) => n !== attData.fileName))
        }
        return
      }

      // Native file drop
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles, user, taskId, commentId, queryClient]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
        e.target.value = ''
      }
    },
    [processFiles]
  )

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
        }`}
      >
        <Upload className="h-4 w-4" />
        <span>Drop files here or click to browse</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {uploading.length > 0 && (
        <div className="mt-2 space-y-1">
          {uploading.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="truncate">{name}</span>
              <X className="ml-auto h-3 w-3 opacity-50" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
