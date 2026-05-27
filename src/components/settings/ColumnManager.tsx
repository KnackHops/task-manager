import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, GripVertical, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  useColumns,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useReorderColumns,
} from '@/hooks/useColumns'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ProjectColumn } from '@/types/database'

interface ColumnManagerProps {
  projectId: string
  projectSlug: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function ColumnManager({ projectId, projectSlug }: ColumnManagerProps) {
  const { data: columns } = useColumns(projectId)
  const createColumn = useCreateColumn(projectId, projectSlug)
  const updateColumn = useUpdateColumn(projectId, projectSlug)
  const deleteColumn = useDeleteColumn(projectId, projectSlug)
  const reorderColumns = useReorderColumns(projectId)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectColumn | null>(null)

  const handleAdd = () => {
    if (!newName.trim()) return
    const slug = newSlug.trim() || slugify(newName)
    createColumn.mutate(
      { name: newName.trim(), slug },
      {
        onSuccess: () => {
          setAdding(false)
          setNewName('')
          setNewSlug('')
          toast.success('Column added')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleUpdate = (columnId: string) => {
    if (!editName.trim()) return
    updateColumn.mutate(
      {
        columnId,
        input: {
          name: editName.trim(),
          slug: editSlug.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null)
          toast.success('Column updated')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteColumn.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Column deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const moveColumn = (index: number, direction: -1 | 1) => {
    if (!columns) return
    const ids = columns.map((c) => c.id)
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= ids.length) return
    ;[ids[index], ids[newIndex]] = [ids[newIndex]!, ids[index]!]
    reorderColumns.mutate(ids)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Columns</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Column
          </button>
        )}
      </div>

      <div className="space-y-1">
        {columns?.map((col, i) => (
          <div
            key={col.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveColumn(i, -1)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <GripVertical className="h-3 w-3" />
              </button>
            </div>

            {editingId === col.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-primary"
                  autoFocus
                />
                <input
                  value={editSlug}
                  onChange={(e) => setEditSlug(slugify(e.target.value))}
                  className="w-24 bg-transparent text-xs text-muted-foreground outline-none border-b border-input font-mono"
                  placeholder="slug"
                />
                <button onClick={() => handleUpdate(col.id)}>
                  <Check className="h-4 w-4 text-primary" />
                </button>
                <button onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    {col.name}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    {col.slug}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingId(col.id)
                    setEditName(col.name)
                    setEditSlug(col.slug)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(col)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/50 px-3 py-2">
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setNewSlug(slugify(e.target.value))
              }}
              placeholder="Column name"
              autoFocus
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(slugify(e.target.value))}
              placeholder="slug"
              className="w-24 bg-transparent text-xs text-muted-foreground outline-none font-mono placeholder:text-muted-foreground"
            />
            <button onClick={handleAdd}>
              <Check className="h-4 w-4 text-primary" />
            </button>
            <button
              onClick={() => {
                setAdding(false)
                setNewName('')
                setNewSlug('')
              }}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Column"
        description={`Delete column "${deleteTarget?.name}"? Tasks in this column need to be moved first.`}
        confirmLabel="Delete"
        isPending={deleteColumn.isPending}
      />
    </div>
  )
}
