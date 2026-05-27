import { useState } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Play,
  CheckCircle2,
  Calendar,
  Loader2,
} from 'lucide-react'
import {
  useSprints,
  useCreateSprint,
  useUpdateSprint,
  useDeleteSprint,
  useCompleteSprint,
} from '@/hooks/useSprints'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useUpdateProject, projectKeys } from '@/hooks/useProjects'
import { sprintKeys } from '@/hooks/useSprints'
import { useProjectContext } from '@/contexts/ProjectContext'
import { autoAssignTasksToSprint } from '@/services/sprints'
import { taskKeys } from '@/hooks/useTasks'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Sprint, SprintStatus } from '@/types/database'

interface SprintManagerProps {
  projectId: string
}

const STATUS_STYLES: Record<SprintStatus, string> = {
  planning: 'bg-blue-500/20 text-blue-400',
  active: 'bg-green-500/20 text-green-400',
  completed: 'bg-muted text-muted-foreground',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDefaultDates(durationDays: number) {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + durationDays)
  return {
    start_date: start.toISOString().split('T')[0]!,
    end_date: end.toISOString().split('T')[0]!,
  }
}

export function SprintManager({ projectId }: SprintManagerProps) {
  const { project } = useProjectContext()
  const queryClient = useQueryClient()
  const updateProject = useUpdateProject(project.slug)
  const isRefetching = useIsFetching({ queryKey: projectKeys.detail(project.slug) })
  const isSaving = updateProject.isPending || isRefetching > 0
  const { data: sprints } = useSprints(projectId)
  const isRefetchingSprints = useIsFetching({ queryKey: sprintKeys.all(projectId) })
  const createSprint = useCreateSprint(projectId)
  const updateSprint = useUpdateSprint(projectId)
  const deleteSprint = useDeleteSprint(projectId)
  const completeSprint = useCompleteSprint(projectId)
  const isSprintOperating =
    updateSprint.isPending || completeSprint.isPending || deleteSprint.isPending || isRefetchingSprints > 0

  const durationDays = project.default_sprint_days ?? 7
  const durationWeeks = Math.floor(durationDays / 7)
  const durationRemDays = durationDays % 7

  const handleDurationChange = (weeks: number, days: number) => {
    const total = weeks * 7 + days
    if (total < 1) return
    updateProject.mutate(
      { projectId, input: { default_sprint_days: total } },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [newSpTarget, setNewSpTarget] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editSpTarget, setEditSpTarget] = useState('')
  const [completeDialogSprint, setCompleteDialogSprint] = useState<Sprint | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Sprint | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>('backlog')

  const activeSprints = sprints?.filter((s) => s.status === 'active') ?? []
  const planningSprints = sprints?.filter((s) => s.status === 'planning') ?? []
  const completedSprints = sprints?.filter((s) => s.status === 'completed') ?? []
  const hasActiveSprint = activeSprints.length > 0

  const handleAdd = () => {
    if (!newName.trim() || !newStartDate || !newEndDate) return
    createSprint.mutate(
      {
        name: newName.trim(),
        goal: newGoal.trim() || undefined,
        start_date: newStartDate,
        end_date: newEndDate,
        story_points_target: newSpTarget ? Number(newSpTarget) : null,
      },
      {
        onSuccess: () => {
          setAdding(false)
          resetAddForm()
          toast.success('Sprint created')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const resetAddForm = () => {
    setNewName('')
    setNewGoal('')
    setNewStartDate('')
    setNewEndDate('')
    setNewSpTarget('')
  }

  const handleUpdate = (sprintId: string) => {
    if (!editName.trim() || !editStartDate || !editEndDate) return
    updateSprint.mutate(
      {
        sprintId,
        input: {
          name: editName.trim(),
          goal: editGoal.trim() || null,
          start_date: editStartDate,
          end_date: editEndDate,
          story_points_target: editSpTarget ? Number(editSpTarget) : null,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null)
          toast.success('Sprint updated')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleStartSprint = (sprintId: string) => {
    if (hasActiveSprint) {
      toast.error('Complete the active sprint before starting another')
      return
    }
    updateSprint.mutate(
      { sprintId, input: { status: 'active' } },
      {
        onSuccess: async () => {
          toast.success('Sprint started')
          if (project.auto_assign_sprint && project.sprint_column_id) {
            try {
              const count = await autoAssignTasksToSprint(
                sprintId,
                project.sprint_column_id,
                projectId
              )
              if (count > 0) {
                toast.success(`Added ${count} task${count !== 1 ? 's' : ''} to sprint`)
              }
              queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
            } catch {
              // Sprint started successfully; don't block on auto-assign failure
            }
          }
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleCompleteSprint = () => {
    if (!completeDialogSprint) return
    completeSprint.mutate(
      {
        sprintId: completeDialogSprint.id,
        moveToSprintId: moveTarget === 'backlog' ? null : moveTarget,
      },
      {
        onSuccess: () => {
          setCompleteDialogSprint(null)
          setMoveTarget('backlog')
          toast.success('Sprint completed')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteSprint.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Sprint deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const startEditing = (sprint: Sprint) => {
    setEditingId(sprint.id)
    setEditName(sprint.name)
    setEditGoal(sprint.goal ?? '')
    setEditStartDate(sprint.start_date.split('T')[0]!)
    setEditEndDate(sprint.end_date.split('T')[0]!)
    setEditSpTarget(sprint.story_points_target?.toString() ?? '')
  }

  const startAdding = () => {
    const defaults = getDefaultDates(durationDays)
    setNewStartDate(defaults.start_date)
    setNewEndDate(defaults.end_date)
    setAdding(true)
  }

  const renderSprintRow = (sprint: Sprint) => (
    <div
      key={sprint.id}
      className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
    >
      {editingId === sprint.id ? (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-primary"
              autoFocus
            />
            <button onClick={() => handleUpdate(sprint.id)}>
              <Check className="h-4 w-4 text-primary" />
            </button>
            <button onClick={() => setEditingId(null)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <input
            value={editGoal}
            onChange={(e) => setEditGoal(e.target.value)}
            placeholder="Sprint goal (optional)"
            className="w-full bg-transparent text-xs text-muted-foreground outline-none border-b border-input"
          />
          <div className="flex items-center gap-2 text-xs">
            <div className="relative flex items-center">
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="relative flex items-center">
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground ml-1">|</span>
            <input
              type="number"
              min="0"
              value={editSpTarget}
              onChange={(e) => setEditSpTarget(e.target.value)}
              placeholder="SP"
              className="w-12 bg-transparent text-muted-foreground outline-none border-b border-input text-center"
            />
            <span className="text-muted-foreground">SP</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {sprint.name}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[sprint.status]}`}
              >
                {sprint.status}
              </span>
            </div>
            {sprint.goal && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {sprint.goal}
              </p>
            )}
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}
              {sprint.story_points_target != null && (
                <span className="ml-1 text-primary/70">· {sprint.story_points_target} SP</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {sprint.status === 'planning' && (
              <button
                onClick={() => handleStartSprint(sprint.id)}
                disabled={isSprintOperating}
                className="text-muted-foreground hover:text-green-400 disabled:opacity-50"
                title="Start Sprint"
              >
                {updateSprint.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {sprint.status === 'active' && (
              <button
                onClick={() => {
                  setCompleteDialogSprint(sprint)
                  setMoveTarget('backlog')
                }}
                disabled={isSprintOperating}
                className="text-muted-foreground hover:text-primary disabled:opacity-50"
                title="Complete Sprint"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            {sprint.status !== 'completed' && (
              <button
                onClick={() => startEditing(sprint)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setDeleteTarget(sprint)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )

  // Available targets for incomplete tasks on sprint completion
  const moveTargets = planningSprints.filter(
    (s) => s.id !== completeDialogSprint?.id
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Sprints</h3>
        {!adding && (
          <button
            onClick={startAdding}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Sprint
          </button>
        )}
      </div>

      {/* Default duration picker */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-muted-foreground">Default duration:</span>
        <select
          value={durationWeeks}
          onChange={(e) => handleDurationChange(Number(e.target.value), durationRemDays)}
          disabled={isSaving}
          className="bg-background border border-input rounded px-1.5 py-0.5 text-xs text-foreground outline-none disabled:opacity-50"
        >
          {[0, 1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}w
            </option>
          ))}
        </select>
        <select
          value={durationRemDays}
          onChange={(e) => handleDurationChange(durationWeeks, Number(e.target.value))}
          disabled={isSaving}
          className="bg-background border border-input rounded px-1.5 py-0.5 text-xs text-foreground outline-none disabled:opacity-50"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
        {isSaving && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="space-y-1">
        {/* Active sprints first */}
        {activeSprints.map(renderSprintRow)}

        {/* Planning sprints */}
        {planningSprints.map(renderSprintRow)}

        {/* Add form */}
        {adding && (
          <div className="rounded-lg border border-primary/50 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Sprint name"
                autoFocus
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button onClick={handleAdd}>
                <Check className="h-4 w-4 text-primary" />
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  resetAddForm()
                }}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <input
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Sprint goal (optional)"
              className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-2 text-xs">
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground ml-1">|</span>
              <input
                type="number"
                min="0"
                value={newSpTarget}
                onChange={(e) => setNewSpTarget(e.target.value)}
                placeholder="SP"
                className="w-12 bg-transparent text-muted-foreground outline-none border-b border-input text-center placeholder:text-muted-foreground"
              />
              <span className="text-muted-foreground">SP</span>
            </div>
          </div>
        )}

        {/* Completed sprints (collapsible) */}
        {completedSprints.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              {completedSprints.length} completed sprint{completedSprints.length !== 1 ? 's' : ''}
            </summary>
            <div className="space-y-1 mt-1">
              {completedSprints.map(renderSprintRow)}
            </div>
          </details>
        )}

        {(!sprints || sprints.length === 0) && !adding && (
          <p className="text-xs text-muted-foreground py-2">
            No sprints yet. Create one to start organizing tasks into time-boxed iterations.
          </p>
        )}
      </div>

      {/* Complete Sprint Dialog */}
      <Dialog
        open={!!completeDialogSprint}
        onClose={() => setCompleteDialogSprint(null)}
      >
        <DialogHeader>
          <DialogTitle>Complete Sprint</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Where should incomplete tasks from{' '}
          <strong className="text-foreground">{completeDialogSprint?.name}</strong>{' '}
          be moved?
        </p>
        <div className="space-y-2 mb-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="move-target"
              checked={moveTarget === 'backlog'}
              onChange={() => setMoveTarget('backlog')}
              className="accent-primary"
            />
            <span className="text-foreground">No Sprint</span>
            <span className="text-xs text-muted-foreground">(remove from sprint)</span>
          </label>
          {moveTargets.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="move-target"
                checked={moveTarget === s.id}
                onChange={() => setMoveTarget(s.id)}
                className="accent-primary"
              />
              <span className="text-foreground">{s.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(s.start_date)} – {formatDate(s.end_date)}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setCompleteDialogSprint(null)}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteSprint}
            disabled={completeSprint.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {completeSprint.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
          </button>
        </div>
      </Dialog>

      {/* Delete Sprint Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Sprint"
        description={`Delete sprint "${deleteTarget?.name}"? Tasks will be unassigned from this sprint.`}
        confirmLabel="Delete"
        isPending={deleteSprint.isPending}
      />
    </div>
  )
}
