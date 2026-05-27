import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { TagSelect } from '@/components/ui/TagSelect'
import { AssigneeSelect } from '@/components/ui/AssigneeSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useCreateTask } from '@/hooks/useTasks'
import { useSprints } from '@/hooks/useSprints'
import { useMembers } from '@/hooks/useMembers'
import type { TaskPriority } from '@/types/database'

interface CreateTaskDialogProps {
  projectId: string
  onClose: () => void
  defaultColumnId?: string
  defaultSprintId?: string
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function CreateTaskDialog({
  projectId,
  onClose,
  defaultColumnId,
  defaultSprintId,
}: CreateTaskDialogProps) {
  const { user } = useAuth()
  const { project, columns, tags } = useProjectContext()
  const createTask = useCreateTask(projectId, user!.id)
  const { data: members } = useMembers(projectId)
  const { data: sprints } = useSprints(projectId)

  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )

  const firstColumnId =
    defaultColumnId ?? project.default_column_id ?? columns[0]?.id ?? ''

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [columnId, setColumnId] = useState(firstColumnId)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? activeSprint?.id ?? '')
  const [storyPoints, setStoryPoints] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !columnId) return

    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        column_id: columnId,
        priority,
        sprint_id: sprintId || null,
        story_points: storyPoints ? Number(storyPoints) : null,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        assignee_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Task created')
          onClose()
        },
        onError: (err) => {
          toast.error(err.message)
        },
      }
    )
  }

  const columnOptions = columns.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <Dialog open onClose={onClose} className="max-w-md">
      <DialogHeader>
        <DialogTitle>New Task</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="title"
            className="text-sm font-medium text-foreground"
          >
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Task title"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="description"
            className="text-sm font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Describe the task..."
          />
        </div>

        <TagSelect
          tags={tags}
          selectedIds={selectedTagIds}
          onChange={setSelectedTagIds}
          label="Tags"
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            id="column"
            label="Column"
            options={columnOptions}
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
          />
          <Select
            id="priority"
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="sprint" className="text-sm font-medium text-foreground">
              Sprint
            </label>
            <select
              id="sprint"
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none"
            >
              <option value="">No Sprint</option>
              {sprints
                ?.filter((s) => s.status !== 'completed')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.status === 'active' ? ' ●' : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="story-points" className="text-sm font-medium text-foreground">
              Story Points
            </label>
            <input
              id="story-points"
              type="number"
              min="0"
              max="100"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="—"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <AssigneeSelect
          members={members ?? []}
          selectedIds={assigneeIds}
          onChange={setAssigneeIds}
          label="Assignees"
        />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createTask.isPending || !title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {createTask.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
