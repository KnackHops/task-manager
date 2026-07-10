import { useState, useRef, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCommentChecklist,
  useCreateCommentChecklistItem,
  useUpdateCommentChecklistItem,
  useDeleteCommentChecklistItem,
  useReorderCommentChecklistItems,
} from '@/hooks/useCommentChecklists'
import { useCommentAttachments, useDeleteAttachment } from '@/hooks/useAttachments'
import { AttachmentItem } from '@/components/attachment/AttachmentItem'
import { FileUpload } from '@/components/attachment/FileUpload'
import type { CommentChecklistItem, AttachmentWithUploader } from '@/types/database'

interface CommentChecklistSectionProps {
  commentId: string
  /** Show add/delete/reorder/inline-edit controls (author while editing). */
  editable: boolean
  /** Allow toggling checkboxes (author). */
  canToggle: boolean
}

export function CommentChecklistSection({ commentId, editable, canToggle }: CommentChecklistSectionProps) {
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { user } = useAuth()
  const { data: items = [] } = useCommentChecklist(commentId)
  const createItem = useCreateCommentChecklistItem(commentId)
  const updateItem = useUpdateCommentChecklistItem(commentId)
  const deleteItem = useDeleteCommentChecklistItem(commentId)
  const reorderItems = useReorderCommentChecklistItems(commentId)

  // Shared cache with CommentItem's attachment list. Group item-linked ones.
  const { data: attachments } = useCommentAttachments(commentId)
  const deleteAttachment = useDeleteAttachment(undefined, commentId)
  const byItem = new Map<string, AttachmentWithUploader[]>()
  for (const a of attachments ?? []) {
    if (!a.comment_checklist_item_id) continue
    const list = byItem.get(a.comment_checklist_item_id) ?? []
    list.push(a)
    byItem.set(a.comment_checklist_item_id, list)
  }

  const handleDeleteAttachment = useCallback(
    (id: string, storagePath: string) => {
      deleteAttachment.mutate({ id, storagePath }, { onError: (err) => toast.error(err.message) })
    },
    [deleteAttachment],
  )

  const completed = items.filter((i) => i.is_done).length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const handleAdd = useCallback(() => {
    const title = newTitle.trim()
    if (!title) return
    createItem.mutate({ title, position: items.length })
    setNewTitle('')
    inputRef.current?.focus()
  }, [newTitle, items.length, createItem])

  const handleToggle = useCallback(
    (item: CommentChecklistItem) => {
      updateItem.mutate({ id: item.id, updates: { is_done: !item.is_done } })
    },
    [updateItem],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || result.source.index === result.destination.index) return
      const reordered = [...items]
      const [moved] = reordered.splice(result.source.index, 1)
      reordered.splice(result.destination.index, 0, moved!)
      reorderItems.mutate({ orderedIds: reordered.map((i) => i.id) })
    },
    [items, reorderItems],
  )

  // Nothing to show for a plain comment that isn't being edited.
  if (total === 0 && !editable) return null

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Checklist{total > 0 && ` (${completed}/${total})`}
        </label>
        {total > 0 && <span className="text-[10px] text-muted-foreground">{pct}%</span>}
      </div>

      {total > 0 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={`comment-checklist-${commentId}`} isDropDisabled={!editable}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="mt-1.5 space-y-0.5">
              {items.map((item, index) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  editable={editable}
                  canToggle={canToggle}
                  commentId={commentId}
                  userId={user?.id}
                  attachments={byItem.get(item.id) ?? []}
                  onToggle={handleToggle}
                  onDelete={(id) => deleteItem.mutate({ id })}
                  onDeleteAttachment={handleDeleteAttachment}
                  onTitleChange={(id, title) => updateItem.mutate({ id, updates: { title } })}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editable && (
        <div className="mt-1.5 flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder="Add item..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}

// ─── Individual item row ────────────────────────────────────────────

interface ChecklistItemRowProps {
  item: CommentChecklistItem
  index: number
  editable: boolean
  canToggle: boolean
  commentId: string
  userId?: string
  attachments: AttachmentWithUploader[]
  onToggle: (item: CommentChecklistItem) => void
  onDelete: (id: string) => void
  onDeleteAttachment: (id: string, storagePath: string) => void
  onTitleChange: (id: string, title: string) => void
}

function ChecklistItemRow({
  item,
  index,
  editable,
  canToggle,
  commentId,
  userId,
  attachments,
  onToggle,
  onDelete,
  onDeleteAttachment,
  onTitleChange,
}: ChecklistItemRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  const commitEdit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.title) {
      onTitleChange(item.id, trimmed)
    } else {
      setDraft(item.title)
    }
  }

  return (
    <Draggable draggableId={item.id} index={index} isDragDisabled={!editable}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="group rounded px-1 py-0.5 hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
          {editable && (
            <span
              {...provided.dragHandleProps}
              className="shrink-0 cursor-grab text-muted-foreground/0 group-hover:text-muted-foreground/40"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}

          <input
            type="checkbox"
            checked={item.is_done}
            disabled={!canToggle}
            onChange={() => onToggle(item)}
            className="shrink-0 accent-primary disabled:opacity-40"
          />

          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') {
                  setDraft(item.title)
                  setEditing(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <span
              className={cn(
                'min-w-0 flex-1 cursor-default text-sm',
                item.is_done && 'text-muted-foreground line-through',
              )}
              onDoubleClick={() => {
                if (editable) {
                  setDraft(item.title)
                  setEditing(true)
                }
              }}
            >
              {item.title}
            </span>
          )}

          {canToggle && (
            <FileUpload compact commentId={commentId} commentChecklistItemId={item.id} />
          )}

          {editable && (
            <button
              onClick={() => onDelete(item.id)}
              className="shrink-0 text-muted-foreground/0 transition-colors hover:text-destructive group-hover:text-muted-foreground/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          </div>

          {attachments.length > 0 && (
            <div className="ml-6 mt-1 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <AttachmentItem
                  key={a.id}
                  attachment={a}
                  grid
                  canDelete={userId === a.uploaded_by}
                  onDelete={onDeleteAttachment}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
