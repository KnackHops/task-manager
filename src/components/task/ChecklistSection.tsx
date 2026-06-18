import { useState, useRef, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useReorderChecklistItems,
} from '@/hooks/useChecklists'
import type { ChecklistItem } from '@/types/database'

interface ChecklistSectionProps {
  taskId: string
  projectId: string
  items: ChecklistItem[]
  canEdit: boolean
}

export function ChecklistSection({ taskId, projectId, items, canEdit }: ChecklistSectionProps) {
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const createItem = useCreateChecklistItem(projectId)
  const updateItem = useUpdateChecklistItem(projectId)
  const deleteItem = useDeleteChecklistItem(projectId)
  const reorderItems = useReorderChecklistItems(projectId)

  const completed = items.filter((i) => i.is_done).length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const handleAdd = useCallback(() => {
    const title = newTitle.trim()
    if (!title) return
    createItem.mutate({ taskId, title, position: items.length })
    setNewTitle('')
    inputRef.current?.focus()
  }, [newTitle, taskId, items.length, createItem])

  const handleToggle = useCallback(
    (item: ChecklistItem) => {
      updateItem.mutate({ id: item.id, taskId, updates: { is_done: !item.is_done } })
    },
    [taskId, updateItem],
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteItem.mutate({ id, taskId })
    },
    [taskId, deleteItem],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || result.source.index === result.destination.index) return
      const reordered = [...items]
      const [moved] = reordered.splice(result.source.index, 1)
      reordered.splice(result.destination.index, 0, moved!)
      reorderItems.mutate({ taskId, orderedIds: reordered.map((i) => i.id) })
    },
    [items, taskId, reorderItems],
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Checklist{total > 0 && ` (${completed}/${total})`}
        </label>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">{pct}%</span>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Items */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="checklist" isDropDisabled={!canEdit}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="mt-2 space-y-0.5">
              {items.map((item, index) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  canEdit={canEdit}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onTitleChange={(id, title) =>
                    updateItem.mutate({ id, taskId, updates: { title } })
                  }
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add item */}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
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
  item: ChecklistItem
  index: number
  canEdit: boolean
  onToggle: (item: ChecklistItem) => void
  onDelete: (id: string) => void
  onTitleChange: (id: string, title: string) => void
}

function ChecklistItemRow({
  item,
  index,
  canEdit,
  onToggle,
  onDelete,
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
    <Draggable draggableId={item.id} index={index} isDragDisabled={!canEdit}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
        >
          {canEdit && (
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
            disabled={!canEdit}
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
                if (canEdit) {
                  setDraft(item.title)
                  setEditing(true)
                }
              }}
            >
              {item.title}
            </span>
          )}

          {canEdit && (
            <button
              onClick={() => onDelete(item.id)}
              className="shrink-0 text-muted-foreground/0 transition-colors hover:text-destructive group-hover:text-muted-foreground/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </Draggable>
  )
}
