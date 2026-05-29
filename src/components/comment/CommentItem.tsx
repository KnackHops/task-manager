import { useState, useRef, useCallback, useMemo } from 'react'
import { Pencil, Trash2, Paperclip, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { AttachmentItem } from '@/components/attachment/AttachmentItem'
import { parseBody, getFirstName } from '@/lib/mentions'
import { MentionPopover } from './MentionPopover'
import { InlineCommentImage } from './InlineCommentImage'
import { InlineFileLink } from './InlineFileLink'
import {
  extractRawBody,
  handleEditorBackspace,
  insertPastedImage,
  handleAttachmentDrop,
  placeCaretAtDropPoint,
  populateEditorFromBody,
  type AttachmentDropData,
} from '@/lib/rich-editor'
import { copyAttachment } from '@/services/attachments'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import {
  useCommentAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  useReorderAttachments,
  attachmentKeys,
} from '@/hooks/useAttachments'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { FILE_SIZE_LIMIT, formatFileSize, extractClipboardFiles, isImageType } from '@/lib/file-utils'
import type { CommentWithAuthor, ProjectMemberWithProfile, AttachmentWithUploader } from '@/types/database'

interface CommentItemProps {
  comment: CommentWithAuthor
  isOwn: boolean
  members: ProjectMemberWithProfile[]
  taskAttachments?: AttachmentWithUploader[]
  onEdit: (commentId: string, body: string) => Promise<void> | void
  onDelete: (commentId: string) => void
}

export function CommentItem({
  comment,
  isOwn,
  members,
  taskAttachments = [],
  onEdit,
  onDelete,
}: CommentItemProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const { data: attachments } = useCommentAttachments(comment.id)
  const deleteAttach = useDeleteAttachment(undefined, comment.id)
  const uploadAttach = useUploadAttachment()
  const reorderAttach = useReorderAttachments(undefined, comment.id)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImagesRef = useRef<Map<string, File>>(new Map())
  const droppedExistingRef = useRef<Map<string, AttachmentDropData>>(new Map())

  const isEdited = comment.updated_at !== comment.created_at
  const segments = parseBody(comment.body)

  // Merge comment + task attachments for resolving inline refs
  const allAttachments = useMemo(
    () => [...(attachments ?? []), ...taskAttachments],
    [attachments, taskAttachments]
  )

  const memberMap = useMemo(() => {
    const map = new Map<string, { fullName: string; email: string }>()
    for (const m of members) {
      map.set(m.user_id, {
        fullName: m.profile.full_name,
        email: m.profile.email,
      })
    }
    return map
  }, [members])

  const startEditing = useCallback(async () => {
    setEditing(true)
    inlineImagesRef.current.clear()
    droppedExistingRef.current.clear()
    // Wait for DOM to render the contentEditable div
    requestAnimationFrame(async () => {
      if (editorRef.current) {
        await populateEditorFromBody(
          editorRef.current,
          comment.body,
          allAttachments,
          memberMap
        )
        editorRef.current.focus()
      }
    })
  }, [comment.body, allAttachments, memberMap])

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

      for (const imageFile of imageFiles) {
        if (imageFile.size > FILE_SIZE_LIMIT) {
          toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${imageFile.name}`)
          continue
        }
        insertPastedImage(imageFile, inlineImagesRef.current)
      }

      if (otherFiles.length > 0) {
        handleAddFiles(otherFiles)
      }
    },
    [handleAddFiles]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleEditorBackspace(e, inlineImagesRef.current)) {
        // handled
      }
    },
    []
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      const stagedIndex = e.dataTransfer.getData('application/staged-file-index')
      if (stagedIndex) {
        e.preventDefault()
        const index = parseInt(stagedIndex, 10)
        const file = stagedFiles[index]
        if (!file || !isImageType(file.type)) return
        placeCaretAtDropPoint(e)
        insertPastedImage(file, inlineImagesRef.current)
        return
      }

      const attData = await handleAttachmentDrop(e, () => {})
      if (attData) {
        droppedExistingRef.current.set(attData.id, attData)
      }
    },
    [stagedFiles]
  )

  const handleSave = async () => {
    const el = editorRef.current
    if (!el || !user) return

    setSaving(true)
    try {
      let finalBody = extractRawBody(el).trim()
      const newAttachIds = new Set<string>()

      // Upload new inline images (temp IDs → real IDs)
      if (inlineImagesRef.current.size > 0) {
        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttach.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { commentId: comment.id },
            })
            finalBody = finalBody.replace(`![](${tempId})`, `![](${attachment.id})`)
            newAttachIds.add(attachment.id)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.replace(`![](${tempId})`, '')
          }
        }
        finalBody = finalBody.trim() || comment.body
      }

      // Copy existing attachments dropped from other sources
      if (droppedExistingRef.current.size > 0) {
        for (const [origId, attData] of droppedExistingRef.current.entries()) {
          try {
            const copied = await copyAttachment(
              attData.storagePath,
              user.id,
              attData.fileName,
              attData.fileType,
              attData.fileSize ?? 0,
              { commentId: comment.id },
            )
            finalBody = finalBody.split(`![](${origId})`).join(`![](${copied.id})`)
            finalBody = finalBody.split(`%[${attData.fileName}](${origId})`).join(`%[${attData.fileName}](${copied.id})`)
            newAttachIds.add(copied.id)
          } catch (err) {
            toast.error(`Failed to copy ${attData.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.split(`![](${origId})`).join('')
            finalBody = finalBody.split(`%[${attData.fileName}](${origId})`).join('')
          }
        }
        finalBody = finalBody.trim() || comment.body
        await queryClient.invalidateQueries({ queryKey: attachmentKeys.comment(comment.id) })
      }

      // Strip inline refs to deleted attachments
      const currentAttachIds = new Set((attachments ?? []).map((a) => a.id))
      finalBody = finalBody.replace(/!\[\]\(([^)]+)\)/g, (match, id) => {
        if (id.startsWith('temp-')) return match // shouldn't happen but guard
        if (currentAttachIds.has(id)) return match
        if (newAttachIds.has(id)) return match
        if (droppedExistingRef.current.has(id)) return match
        return '' // deleted attachment — strip
      })
      finalBody = finalBody.replace(/%\[[^\]]*\]\(([^)]+)\)/g, (match, id) => {
        if (currentAttachIds.has(id)) return match
        if (newAttachIds.has(id)) return match
        if (droppedExistingRef.current.has(id)) return match
        return ''
      })
      finalBody = finalBody.trim() || comment.body

      if (finalBody && finalBody !== comment.body) {
        await onEdit(comment.id, finalBody)
      }

      // Upload staged files (skip if already inlined)
      const inlineFiles = new Set(inlineImagesRef.current.values())
      for (const file of stagedFiles) {
        if (inlineFiles.has(file)) continue
        try {
          await uploadAttach.mutateAsync({
            file,
            uploadedBy: user.id,
            target: { commentId: comment.id },
          })
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }
    } finally {
      setSaving(false)
      setStagedFiles([])
      inlineImagesRef.current.clear()
      droppedExistingRef.current.clear()
      setEditing(false)
    }
  }

  const handleAttachDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !attachments) return
      if (result.source.index === result.destination.index) return
      const reordered = Array.from(attachments)
      const [moved] = reordered.splice(result.source.index, 1)
      reordered.splice(result.destination.index, 0, moved!)
      reorderAttach.mutate(reordered.map((a) => a.id))
    },
    [attachments, reorderAttach]
  )

  const handleCancelEdit = () => {
    setStagedFiles([])
    inlineImagesRef.current.clear()
    droppedExistingRef.current.clear()
    setEditing(false)
  }

  return (
    <div className="group flex gap-3 py-2">
      <Avatar
        name={comment.author?.full_name ?? 'Deleted User'}
        url={comment.author?.avatar_url ?? null}
        size="md"
        className="shrink-0 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {comment.author?.full_name ?? 'Deleted User'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), {
              addSuffix: true,
            })}
          </span>
          {isEdited && (
            <span className="text-xs text-muted-foreground italic">
              (edited)
            </span>
          )}
          {isOwn && !editing && (
            <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={startEditing}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <div
              ref={editorRef}
              contentEditable
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="w-full min-h-[2.5rem] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset [&_img]:max-w-full [&_img]:rounded-lg"
            />

            {/* Existing attachments (reorderable) */}
            {attachments && attachments.length > 0 && (
              <DragDropContext onDragEnd={handleAttachDragEnd}>
                <Droppable droppableId={`comment-attachments-${comment.id}`}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex flex-wrap gap-1.5"
                    >
                      {attachments.map((a, index) => (
                        <Draggable key={a.id} draggableId={a.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                            >
                              <AttachmentItem
                                attachment={a}
                                canDelete={isOwn}
                                onDelete={(id, path) =>
                                  deleteAttach.mutate(
                                    { id, storagePath: path },
                                    { onError: (err) => toast.error(err.message) }
                                  )
                                }
                                compact
                                dragHandleProps={provided.dragHandleProps}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}

            {/* Staged files preview */}
            {stagedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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
                      onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-0.5 hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="rounded-md border border-input px-3 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
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
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-foreground whitespace-pre-wrap break-words">
            {segments.map((seg, i) =>
              seg.type === 'mention' ? (
                <MentionPopover
                  key={i}
                  name={memberMap.get(seg.userId)?.fullName ?? seg.name}
                  email={memberMap.get(seg.userId)?.email ?? null}
                >
                  <span className="rounded bg-primary/20 px-1 text-primary font-medium cursor-default">
                    @{getFirstName(seg.name)}
                  </span>
                </MentionPopover>
              ) : seg.type === 'image' ? (
                <InlineCommentImage
                  key={i}
                  attachmentId={seg.attachmentId}
                  attachments={allAttachments}
                />
              ) : seg.type === 'file_link' ? (
                <InlineFileLink
                  key={i}
                  attachmentId={seg.attachmentId}
                  fileName={seg.fileName}
                  attachments={allAttachments}
                />
              ) : (
                <span key={i}>{seg.value}</span>
              )
            )}
          </div>
        )}

        {/* Comment attachments (view mode) */}
        {!editing && (() => {
          const commentAttachments = attachments ?? []
          if (commentAttachments.length === 0) return null
          return (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {commentAttachments.map((a) => (
                <AttachmentItem
                  key={a.id}
                  attachment={a}
                  canDelete={isOwn}
                  onDelete={(id, path) =>
                    deleteAttach.mutate(
                      { id, storagePath: path },
                      { onError: (err) => toast.error(err.message) }
                    )
                  }
                  compact
                />
              ))}
            </div>
          )
        })()}
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => {
          onDelete(comment.id)
          setDeleteConfirm(false)
        }}
        title="Delete comment"
        description="Delete this comment? This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  )
}
