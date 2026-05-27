import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useCreateTag, useUpdateTag, useDeleteTag, useTags } from '@/hooks/useTags'
import { TagBadge } from '@/components/ui/Badge'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ProjectTag } from '@/types/database'

interface TagManagerProps {
  projectId: string
  projectSlug: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function TagManager({ projectId, projectSlug }: TagManagerProps) {
  const { data: tags } = useTags(projectId)
  const createTag = useCreateTag(projectId, projectSlug)
  const updateTag = useUpdateTag(projectId, projectSlug)
  const deleteTag = useDeleteTag(projectId, projectSlug)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newColor, setNewColor] = useState('gray')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editColor, setEditColor] = useState('gray')
  const [deleteTarget, setDeleteTarget] = useState<ProjectTag | null>(null)

  const handleAdd = () => {
    if (!newName.trim()) return
    createTag.mutate(
      {
        name: newName.trim(),
        slug: newSlug.trim() || slugify(newName),
        color: newColor,
      },
      {
        onSuccess: () => {
          setAdding(false)
          setNewName('')
          setNewSlug('')
          setNewColor('gray')
          toast.success('Tag added')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleUpdate = (tagId: string) => {
    if (!editName.trim()) return
    updateTag.mutate(
      {
        tagId,
        input: {
          name: editName.trim(),
          slug: editSlug.trim() || undefined,
          color: editColor,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null)
          toast.success('Tag updated')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteTag.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Tag deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Tags</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Tag
          </button>
        )}
      </div>

      <div className="space-y-1">
        {tags?.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            {editingId === tag.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
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
                  <button onClick={() => handleUpdate(tag.id)}>
                    <Check className="h-4 w-4 text-primary" />
                  </button>
                  <button onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            ) : (
              <>
                <TagBadge name={tag.name} color={tag.color} />
                <span className="flex-1 text-xs text-muted-foreground font-mono">
                  {tag.slug}
                </span>
                <button
                  onClick={() => {
                    setEditingId(tag.id)
                    setEditName(tag.name)
                    setEditSlug(tag.slug)
                    setEditColor(tag.color)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(tag)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="rounded-lg border border-primary/50 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setNewSlug(slugify(e.target.value))
                }}
                placeholder="Tag name"
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
                  setNewColor('gray')
                }}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Tag"
        description={`Delete tag "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        isPending={deleteTag.isPending}
      />
    </div>
  )
}
