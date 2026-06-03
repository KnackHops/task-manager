import { useState, useRef, useCallback, useMemo } from 'react'
import { Pencil, Trash2, Paperclip, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { AttachmentItem } from '@/components/attachment/AttachmentItem'
import { parseBody, getFirstName } from '@/lib/mentions'
import { MentionPopover } from './MentionPopover'
import { InlineCommentImage } from './InlineCommentImage'
import { InlineFileLink } from './InlineFileLink'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
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
} from '@/hooks/useAttachments'
import { useAuth } from '@/contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { FILE_SIZE_LIMIT, formatFileSize } from '@/lib/file-utils'
import { replaceInlineTempId, removeInlineTempId } from '@/lib/rich-editor'
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
  const [editing, setEditing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [editRaw, setEditRaw] = useState('')
  const { data: attachments } = useCommentAttachments(comment.id)
  const deleteAttach = useDeleteAttachment(undefined, comment.id)
  const uploadAttach = useUploadAttachment()
  const reorderAttach = useReorderAttachments(undefined, comment.id)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImagesRef = useRef<Map<string, File>>(new Map())

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

  const startEditing = useCallback(() => {
    setEditRaw(comment.body)
    setEditing(true)
    inlineImagesRef.current.clear()
  }, [comment.body])

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

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    try {
      let finalBody = editRaw.trim()
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
            finalBody = replaceInlineTempId(finalBody, tempId, attachment.id, file.name)
            newAttachIds.add(attachment.id)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = removeInlineTempId(finalBody, tempId)
          }
        }
        finalBody = finalBody.trim() || comment.body
      }

      // Strip inline refs to deleted attachments
      const currentAttachIds = new Set((attachments ?? []).map((a) => a.id))
      finalBody = finalBody.replace(/!\[\]\(([^)]+)\)/g, (match, id) => {
        if (id.startsWith('temp-')) return match // shouldn't happen but guard
        if (currentAttachIds.has(id)) return match
        if (newAttachIds.has(id)) return match
        return '' // deleted attachment — strip
      })
      finalBody = finalBody.replace(/%\[[^\]]*\]\(([^)]+)\)/g, (match, id) => {
        if (currentAttachIds.has(id)) return match
        if (newAttachIds.has(id)) return match
        return ''
      })
      finalBody = finalBody.trim() || comment.body

      if (finalBody && finalBody !== comment.body) {
        await onEdit(comment.id, finalBody)
      }

      // Upload staged files
      for (const file of stagedFiles) {
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
          <span className="text-sm font-medium capitalize text-foreground">
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
            <RichTextEditor
              content={editRaw}
              onChange={setEditRaw}
              placeholder="Edit comment..."
              members={members}
              onImagePaste={(file) => {
                if (file.size > FILE_SIZE_LIMIT) {
                  toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                  return null
                }
                const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
                inlineImagesRef.current.set(tempId, file)
                return tempId
              }}
              stagedFiles={stagedFiles}
              onStagedFileDrop={(file) => {
                if (file.size > FILE_SIZE_LIMIT) {
                  toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                  return null
                }
                const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
                inlineImagesRef.current.set(tempId, file)
                return tempId
              }}
              minHeight="2.5rem"
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
          <div className="mt-0.5 text-sm text-foreground whitespace-pre-wrap wrap-break-word">
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
              ) : seg.type === 'bold' ? (
                <strong key={i} className="font-semibold">{seg.value}</strong>
              ) : seg.type === 'italic' ? (
                <em key={i}>{seg.value}</em>
              ) : seg.type === 'strike' ? (
                <s key={i} className="text-muted-foreground">{seg.value}</s>
              ) : seg.type === 'code' ? (
                <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{seg.value}</code>
              ) : seg.type === 'link' ? (
                <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{seg.text}</a>
              ) : seg.type === 'list' ? (
                seg.ordered ? (
                  <ol key={i} className="list-decimal pl-5 my-1">{seg.items.map((item, j) => <li key={j}>{item}</li>)}</ol>
                ) : (
                  <ul key={i} className="list-disc pl-5 my-1">{seg.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                )
              ) : (
                <span key={i}>{'value' in seg ? seg.value : ''}</span>
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
