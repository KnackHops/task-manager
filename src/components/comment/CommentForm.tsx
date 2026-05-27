import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useMembers } from '@/hooks/useMembers'
import { useCreateComment } from '@/hooks/useComments'
import { useUploadAttachment } from '@/hooks/useAttachments'
import { reassignAttachmentsToComment } from '@/services/attachments'
import { FILE_SIZE_LIMIT, formatFileSize, extractClipboardFiles, isImageType } from '@/lib/file-utils'
import {
  INLINE_IMG_ATTR,
  extractRawBody,
  getTextBeforeCursor,
  createMentionSpan,
  handleEditorBackspace,
  insertPastedImage,
  handleAttachmentDrop,
} from '@/lib/rich-editor'
import { MentionDropdown } from './MentionDropdown'
import type { ProjectMemberWithProfile } from '@/types/database'

interface CommentFormProps {
  taskId: string
  projectId: string
}

export function CommentForm({ taskId, projectId }: CommentFormProps) {
  const { user } = useAuth()
  const { data: members } = useMembers(projectId)
  const createComment = useCreateComment(taskId)
  const uploadAttachment = useUploadAttachment(taskId)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Map temp inline IDs → File for pasted images
  const inlineImagesRef = useRef<Map<string, File>>(new Map())

  const checkEmpty = useCallback(() => {
    if (!editorRef.current) return
    const text = editorRef.current.textContent ?? ''
    const hasImages = editorRef.current.querySelector(`img[${INLINE_IMG_ATTR}]`) !== null
    setIsEmpty(text.trim().length === 0 && !hasImages)
  }, [])

  const detectMention = useCallback(() => {
    const textBefore = getTextBeforeCursor()
    const atIndex = textBefore.lastIndexOf('@')

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : ' '
      if (atIndex === 0 || /\s/.test(charBefore!)) {
        const query = textBefore.slice(atIndex + 1)
        if (query.includes(' ')) {
          setMentionQuery(null)
        } else {
          setMentionQuery(query)
        }
        return
      }
    }
    setMentionQuery(null)
  }, [])

  const handleInput = useCallback(() => {
    checkEmpty()
    detectMention()
  }, [checkEmpty, detectMention])

  const handleMentionSelect = useCallback(
    (member: ProjectMemberWithProfile) => {
      const el = editorRef.current
      if (!el) return

      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const textBefore = getTextBeforeCursor()
      const atIndex = textBefore.lastIndexOf('@')
      if (atIndex < 0) return

      const deleteLength = textBefore.length - atIndex

      for (let i = 0; i < deleteLength; i++) {
        sel.modify('extend', 'backward', 'character')
      }
      sel.deleteFromDocument()

      const mentionSpan = createMentionSpan(member)
      const newRange = sel.getRangeAt(0)
      newRange.insertNode(mentionSpan)

      const space = document.createTextNode('\u00A0')
      mentionSpan.after(space)
      newRange.setStartAfter(space)
      newRange.setEndAfter(space)
      sel.removeAllRanges()
      sel.addRange(newRange)

      setMentionQuery(null)
      checkEmpty()
    },
    [checkEmpty]
  )

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = extractClipboardFiles(e)
      if (files.length === 0) return

      e.preventDefault()

      const imageFiles = files.filter((f) => isImageType(f.type))
      const otherFiles = files.filter((f) => !isImageType(f.type))

      // Insert images inline in editor at cursor position
      for (const imageFile of imageFiles) {
        if (imageFile.size > FILE_SIZE_LIMIT) {
          toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${imageFile.name}`)
          continue
        }
        insertPastedImage(imageFile, inlineImagesRef.current)
      }
      if (imageFiles.length > 0) checkEmpty()

      // Non-image files go to staged files
      if (otherFiles.length > 0) {
        handleAddFiles(otherFiles)
      }
    },
    [handleAddFiles, checkEmpty]
  )

  const handleRemoveFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = useCallback(async () => {
    const el = editorRef.current
    if (!el || !user) return
    const rawBody = extractRawBody(el).trim()
    const hasInlineImages = inlineImagesRef.current.size > 0
    if (!rawBody && stagedFiles.length === 0 && !hasInlineImages) return

    setSubmitting(true)
    try {
      // Step 1: Upload inline images as task attachments (before comment exists)
      let finalBody = rawBody || '(attachment)'
      const inlineAttachmentIds: string[] = []

      if (hasInlineImages) {
        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttachment.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { taskId },
            })
            finalBody = finalBody.replace(`![](${tempId})`, `![](${attachment.id})`)
            inlineAttachmentIds.push(attachment.id)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.replace(`![](${tempId})`, '')
          }
        }
        finalBody = finalBody.trim() || '(attachment)'
      }

      // Step 2: Create comment with final body (real attachment IDs already in place)
      const comment = await createComment.mutateAsync({
        authorId: user.id,
        body: finalBody,
      })

      // Step 3: Reassign inline attachments from task → comment
      if (inlineAttachmentIds.length > 0) {
        await reassignAttachmentsToComment(inlineAttachmentIds, comment.id)
      }

      // Step 4: Upload non-inline staged files with commentId
      for (const file of stagedFiles) {
        try {
          await uploadAttachment.mutateAsync({
            file,
            uploadedBy: user.id,
            target: { commentId: comment.id },
          })
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      el.innerHTML = ''
      setIsEmpty(true)
      setStagedFiles([])
      inlineImagesRef.current.clear()
      setMentionQuery(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }, [user, taskId, createComment, uploadAttachment, stagedFiles])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      const handled = await handleAttachmentDrop(e, checkEmpty)
      if (!handled) return // let browser handle normal drops
    },
    [checkEmpty]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'Enter' &&
        mentionQuery === null
      ) {
        e.preventDefault()
        handleSubmit()
      }
      if (handleEditorBackspace(e, inlineImagesRef.current)) {
        checkEmpty()
      }
    },
    [mentionQuery, handleSubmit, checkEmpty]
  )

  return (
    <div className="relative mt-3">
      <MentionDropdown
        members={members ?? []}
        query={mentionQuery ?? ''}
        onSelect={handleMentionSelect}
        onClose={() => setMentionQuery(null)}
        visible={mentionQuery !== null}
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            role="textbox"
            aria-multiline="true"
            aria-placeholder="Add a comment... (@ to mention)"
            className="min-h-[4.75rem] max-h-48 overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_img]:max-w-full [&_img]:rounded-lg"
          />
          {isEmpty && stagedFiles.length === 0 && (
            <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
              Add a comment... (@ to mention)
            </div>
          )}
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
            disabled={(isEmpty && stagedFiles.length === 0) || submitting}
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
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
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
