import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useMembers } from '@/hooks/useMembers'
import { useCreateComment } from '@/hooks/useComments'
import { attachmentKeys } from '@/hooks/useAttachments'
import { useQueryClient } from '@tanstack/react-query'
import { assignAttachmentsToComment, uploadAttachment as uploadAttachmentRaw } from '@/services/attachments'
import { FILE_SIZE_LIMIT, formatFileSize } from '@/lib/file-utils'
import { replaceInlineTempId, removeInlineTempId } from '@/lib/rich-editor'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { useEditor } from '@tiptap/react'

interface CommentFormProps {
  taskId: string
  projectId: string
}

export function CommentForm({ taskId, projectId }: CommentFormProps) {
  const { user } = useAuth()
  const { data: members } = useMembers(projectId)
  const queryClient = useQueryClient()
  const createComment = useCreateComment(taskId)

  const [commentRaw, setCommentRaw] = useState('')
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Map temp inline IDs → File for pasted images
  const inlineImagesRef = useRef<Map<string, File>>(new Map())
  const tiptapRef = useRef<ReturnType<typeof useEditor> | null>(null)

  const handleAddFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const oversized = arr.filter((f) => f.size > FILE_SIZE_LIMIT)
    if (oversized.length > 0) {
      toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${oversized.map((f) => f.name).join(', ')}`)
    }
    const valid = arr.filter((f) => f.size <= FILE_SIZE_LIMIT)
    if (valid.length > 0) {
      setStagedFiles((prev) => [...prev, ...valid])
    }
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!user) return
    const rawBody = commentRaw.trim()
    const hasInlineImages = inlineImagesRef.current.size > 0
    if (!rawBody && stagedFiles.length === 0 && !hasInlineImages) return

    setSubmitting(true)
    try {
      let finalBody = rawBody || '(attachment)'
      const orphanIds: string[] = []

      // Step 1: Upload inline images as orphans (no task_id, no comment_id)
      if (hasInlineImages) {
        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttachmentRaw(file, user.id, 'orphan')
            finalBody = replaceInlineTempId(finalBody, tempId, attachment.id, file.name)
            orphanIds.push(attachment.id)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = removeInlineTempId(finalBody, tempId)
          }
        }
        finalBody = finalBody.trim() || '(attachment)'
      }

      // Step 2: Create comment with final body (real attachment IDs already in place)
      const comment = await createComment.mutateAsync({
        authorId: user.id,
        body: finalBody,
      })

      // Step 3: Assign orphan attachments to the new comment
      if (orphanIds.length > 0) {
        await assignAttachmentsToComment(orphanIds, comment.id)
        await queryClient.invalidateQueries({ queryKey: attachmentKeys.comment(comment.id) })
      }

      // Step 4: Upload staged files directly to comment
      for (const file of stagedFiles) {
        try {
          await uploadAttachmentRaw(file, user.id, { commentId: comment.id })
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }
      if (stagedFiles.length > 0) {
        await queryClient.invalidateQueries({ queryKey: attachmentKeys.comment(comment.id) })
      }

      tiptapRef.current?.commands.clearContent()
      setCommentRaw('')
      setStagedFiles([])
      inlineImagesRef.current.clear()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }, [user, commentRaw, createComment, stagedFiles, queryClient])

  return (
    <div className="relative mt-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <RichTextEditor
            content={commentRaw}
            onChange={setCommentRaw}
            placeholder="Add a comment... (@ to mention)"
            members={members ?? []}
            onImagePaste={(file) => {
              if (file.size > FILE_SIZE_LIMIT) {
                toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                return null
              }
              const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
              inlineImagesRef.current.set(tempId, file)
              return tempId
            }}
            onSubmit={handleSubmit}
            stagedFiles={stagedFiles}
            onStagedFileDrop={(file) => {
              if (file.size > FILE_SIZE_LIMIT) {
                toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                return null
              }
              const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
              inlineImagesRef.current.set(tempId, file)
              setStagedFiles((prev) => prev.filter((f) => f !== file))
              return tempId
            }}
            minHeight="4.75rem"
            editorRef={tiptapRef}
          />
        </div>
        <div className="flex flex-col gap-1 self-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-input p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={(commentRaw.trim() === '' && stagedFiles.length === 0) || submitting}
            className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) handleAddFiles(e.target.files)
            e.target.value = ''
          }}
          className="hidden"
        />
      </div>

      {/* Staged files preview */}
      {stagedFiles.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {stagedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/staged-file-index', String(i))
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground cursor-grab"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => handleRemoveFile(i)}
                className="ml-0.5 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-1 text-[10px] text-muted-foreground">
        {/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+Enter to send
      </p>
    </div>
  )
}
