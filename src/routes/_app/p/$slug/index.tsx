import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Star, Play, CheckCircle2, ListPlus, Loader2, LayoutGrid, List, UserCheck } from 'lucide-react'
import { useIsFetching } from '@tanstack/react-query'
import { useProjectContext } from '@/contexts/ProjectContext'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useToggleFavorite } from '@/hooks/useMembers'
import { useSprints, useCompleteSprint, sprintKeys } from '@/hooks/useSprints'
import { useTasks } from '@/hooks/useTasks'
import { BoardContainer } from '@/components/board/BoardContainer'
import { BoardListView } from '@/components/board/BoardListView'
import { MyTasksView } from '@/components/board/MyTasksView'
import { cn } from '@/lib/utils'
import { SprintFilterDropdown, type SprintFilterDropdownHandle } from '@/components/board/SprintFilterDropdown'
import { SprintTaskSelectionPanel } from '@/components/board/SprintTaskSelectionPanel'
import { CreateTaskDialog } from '@/components/task/CreateTaskDialog'
import { TaskDetailPanel } from '@/components/task/TaskDetailPanel'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import type { Sprint } from '@/types/database'

export const Route = createFileRoute('/_app/p/$slug/')({
  component: BoardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    task: (search.task as string) || undefined,
    sprint: (search.sprint as string) || undefined,
  }),
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function BoardPage() {
  const { project, membership, canCreateTask, canManageSprints } = useProjectContext()
  const { user } = useAuth()
  const toggleFavorite = useToggleFavorite()
  const navigate = Route.useNavigate()
  const { task: taskFromUrl, sprint: sprintFromUrl } = Route.useSearch()
  const sprintDropdownRef = useRef<SprintFilterDropdownHandle>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'mine'>(() => {
    const saved = localStorage.getItem('boardViewMode')
    return saved === 'list' ? 'list' : 'board'
  })

  const setView = (mode: 'board' | 'list') => {
    setViewMode(mode)
    try {
      localStorage.setItem('boardViewMode', mode)
    } catch {
      // ignore persistence failures
    }
  }
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectionPanelSprint, setSelectionPanelSprint] = useState<Sprint | null>(null)
  const [completeDialogSprint, setCompleteDialogSprint] = useState<Sprint | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>('backlog')

  const { data: sprints } = useSprints(project.id)
  const completeSprint = useCompleteSprint(project.id)
  const isRefetchingSprints = useIsFetching({ queryKey: sprintKeys.all(project.id) })

  // Sprint filter: "all" = no filter, "backlog" = null sprint, or sprint ID
  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )

  // Check if active sprint has tasks (for smart default)
  const { data: activeSprintTasks } = useTasks(
    project.id,
    activeSprint ? { sprintId: activeSprint.id } : undefined
  )

  const [sprintFilter, setSprintFilter] = useState<string | undefined>(sprintFromUrl)

  // Default to active sprint when sprints load (if no URL param set)
  // Only if it has tasks, otherwise default to "all"
  useEffect(() => {
    if (sprintFilter === undefined && activeSprint) {
      if (activeSprintTasks && activeSprintTasks.length > 0) {
        setSprintFilter(activeSprint.id)
      } else if (activeSprintTasks !== undefined) {
        setSprintFilter('all')
      }
    } else if (sprintFilter === undefined && sprints && !activeSprint) {
      setSprintFilter('all')
    }
  }, [activeSprint, sprintFilter, activeSprintTasks, sprints])

  // Derive the actual sprintId to pass to BoardContainer
  const boardSprintId =
    sprintFilter === 'all'
      ? undefined
      : sprintFilter === 'backlog'
        ? null
        : sprintFilter

  // Derive defaultSprintId for CreateTaskDialog
  const createTaskSprintId =
    sprintFilter && sprintFilter !== 'all' && sprintFilter !== 'backlog'
      ? sprintFilter
      : undefined

  // Currently selected sprint object
  const currentSprint =
    sprintFilter && sprintFilter !== 'all' && sprintFilter !== 'backlog'
      ? sprints?.find((s) => s.id === sprintFilter) ?? null
      : null

  // Planning sprints for complete dialog move targets
  const planningSprints = useMemo(
    () => sprints?.filter((s) => s.status === 'planning' && s.id !== completeDialogSprint?.id) ?? [],
    [sprints, completeDialogSprint]
  )

  // Loading: mutation pending or refetch in progress
  const isSprintOperating = completeSprint.isPending || isRefetchingSprints > 0

  // Open task from URL search param (e.g. notification click)
  useEffect(() => {
    if (taskFromUrl) {
      setSelectedTaskId(taskFromUrl)
      navigate({ search: (prev) => ({ ...prev, task: undefined }), replace: true })
    }
  }, [taskFromUrl, navigate])

  const handleCompleteSprint = () => {
    if (!completeDialogSprint) return
    completeSprint.mutate(
      {
        sprintId: completeDialogSprint.id,
        moveToSprintId: moveTarget === 'backlog' ? null : moveTarget,
      },
      {
        onSuccess: () => {
          toast.success('Sprint completed')
          setCompleteDialogSprint(null)
          setMoveTarget('backlog')
          setSprintFilter('all')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // Sprint filter still resolving — show full skeleton
  if (sprintFilter === undefined && !sprintFromUrl) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-1 min-h-0 gap-4 overflow-hidden pb-4">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col} className="flex w-64 shrink-0 flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>
              {Array.from({ length: 3 - col % 2 }).map((_, card) => (
                <div key={card} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Board</h2>
          <button
            onClick={() =>
              toggleFavorite.mutate({
                projectId: project.id,
                isFavorite: !membership.is_favorite,
              })
            }
            className="text-muted-foreground hover:text-yellow-500 transition-colors"
          >
            <Star
              className={`h-4 w-4 ${membership.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`}
            />
          </button>
          {(sprints && sprints.length > 0 || canManageSprints) && (
            <SprintFilterDropdown
              ref={sprintDropdownRef}
              sprints={sprints ?? []}
              value={sprintFilter}
              onChange={setSprintFilter}
              canManageSprints={canManageSprints}
              projectId={project.id}
              defaultSprintDays={project.default_sprint_days}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-input p-0.5">
            <button
              onClick={() => setView('board')}
              title="Board view"
              className={cn(
                'flex items-center justify-center rounded-md p-1.5 transition-colors',
                viewMode === 'board'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title="List view"
              className={cn(
                'flex items-center justify-center rounded-md p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'mine' ? 'board' : 'mine')}
            title="My tasks on this project"
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              viewMode === 'mine'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-foreground hover:bg-muted'
            )}
          >
            <UserCheck className="h-4 w-4" />
            My Tasks
          </button>
          {currentSprint && canManageSprints ? (
            <>
              {currentSprint.status === 'planning' && (
                <button
                  onClick={() => sprintDropdownRef.current?.startSprint(currentSprint)}
                  disabled={isSprintOperating}
                  className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {isSprintOperating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Start Sprint
                </button>
              )}
              {currentSprint.status === 'active' && (
                <button
                  onClick={() => {
                    setCompleteDialogSprint(currentSprint)
                    setMoveTarget('backlog')
                  }}
                  disabled={isSprintOperating}
                  className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {isSprintOperating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Complete Sprint
                </button>
              )}
              <button
                onClick={() => setSelectionPanelSprint(currentSprint)}
                className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <ListPlus className="h-4 w-4" />
                Add Tasks
              </button>
            </>
          ) : (
            canManageSprints && (
              <button
                onClick={() => sprintDropdownRef.current?.openCreate()}
                className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Sprint
              </button>
            )
          )}
          {canCreateTask && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {viewMode === 'mine' ? (
          <MyTasksView
            projectId={project.id}
            projectPrefix={project.prefix}
            activeSprint={activeSprint ? { id: activeSprint.id, name: activeSprint.name } : null}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
          />
        ) : viewMode === 'board' ? (
          <BoardContainer
            projectId={project.id}
            sprintId={boardSprintId}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
          />
        ) : (
          <BoardListView
            projectId={project.id}
            sprintId={boardSprintId}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
          />
        )}
      </div>

      {createOpen && user && (
        <CreateTaskDialog
          projectId={project.id}
          onClose={() => setCreateOpen(false)}
          defaultSprintId={createTaskSprintId}
        />
      )}

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={project.id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {selectionPanelSprint && (
        <SprintTaskSelectionPanel
          sprint={selectionPanelSprint}
          projectId={project.id}
          onClose={() => setSelectionPanelSprint(null)}
        />
      )}

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
              name="board-move-target"
              checked={moveTarget === 'backlog'}
              onChange={() => setMoveTarget('backlog')}
              className="accent-primary"
            />
            <span className="text-foreground">No Sprint</span>
            <span className="text-xs text-muted-foreground">(remove from sprint)</span>
          </label>
          {planningSprints.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="board-move-target"
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
    </div>
  )
}
