import { useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical, Calendar, Zap, MessageSquare, Paperclip } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTasks } from '@/hooks/useTasks'
import { useSprints } from '@/hooks/useSprints'
import {
  useProjectTaskSeconds,
  useProjectTotals,
  useSprintTotal,
  useRunningSession,
  useTaskRanks,
  useSetTaskRank,
} from '@/hooks/useTimeTracking'
import { midpointRank } from '@/services/user-task-order'
import { formatDuration } from '@/lib/time-format'
import { PriorityDot, TagBadge } from '@/components/ui/Badge'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { TaskTimerButton } from '@/components/task/TaskTimerButton'
import { cn } from '@/lib/utils'
import type { TaskWithRelations } from '@/types/database'

interface MyTasksViewProps {
  projectId: string
  projectPrefix: string
  activeSprint?: { id: string; name: string } | null
  onTaskClick: (taskId: string) => void
}

function fmtDue(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MyTasksView({ projectId, projectPrefix, activeSprint, onTaskClick }: MyTasksViewProps) {
  const { user } = useAuth()
  const userId = user?.id

  const { data: allTasks, isLoading } = useTasks(projectId)
  const { data: secondsMap } = useProjectTaskSeconds(userId, projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: running } = useRunningSession(userId)
  const { data: totals } = useProjectTotals(userId, projectId)
  const { data: sprintSeconds } = useSprintTotal(userId, activeSprint?.id)

  const runningTaskId = running?.task_id ?? null
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of sprints ?? []) m[s.id] = s.name
    return m
  }, [sprints])

  const mine = useMemo(
    () =>
      (allTasks ?? []).filter(
        (t) => !t.archived && !t.is_done && (t.assignees ?? []).some((a) => a.id === userId),
      ),
    [allTasks, userId],
  )
  const taskIds = useMemo(() => mine.map((t) => t.id), [mine])
  const { data: ranks } = useTaskRanks(userId, projectId, taskIds)
  const setRank = useSetTaskRank(userId, projectId)

  const ordered = useMemo(() => {
    const r = ranks ?? {}
    return [...mine].sort((a, b) => {
      const ra = r[a.id]
      const rb = r[b.id]
      if (ra != null && rb != null) return ra - rb
      if (ra != null) return -1
      if (rb != null) return 1
      return a.task_number - b.task_number
    })
  }, [mine, ranks])

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const from = result.source.index
    const to = result.destination.index
    if (from === to) return
    const reordered = Array.from(ordered)
    const [moved] = reordered.splice(from, 1) as [TaskWithRelations]
    reordered.splice(to, 0, moved)
    const rankArr = reordered.map((t) => (ranks ?? {})[t.id] ?? null)
    setRank.mutate({ taskId: result.draggableId, rank: midpointRank(rankArr, to) })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Inline stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Today <span className="font-semibold tabular-nums text-foreground">{formatDuration(totals?.todaySeconds ?? 0)}</span>
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground">
          Week <span className="font-semibold tabular-nums text-foreground">{formatDuration(totals?.weekSeconds ?? 0)}</span>
        </span>
        {activeSprint && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">
              {activeSprint.name} <span className="font-semibold tabular-nums text-foreground">{formatDuration(sprintSeconds ?? 0)}</span>
            </span>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : ordered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No tasks assigned to you on this project.</p>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="my-tasks">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-1.5">
                  {ordered.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(p) => (
                        <div ref={p.innerRef} {...p.draggableProps}>
                          <MyTaskRow
                            task={task}
                            seconds={secondsMap?.[task.id] ?? 0}
                            isRunning={runningTaskId === task.id}
                            projectPrefix={projectPrefix}
                            sprintName={task.sprint_id ? sprintNames[task.sprint_id] : undefined}
                            onClick={() => onTaskClick(task.id)}
                            dragHandleProps={(p.dragHandleProps ?? undefined) as Record<string, unknown> | undefined}
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
      </div>
    </div>
  )
}

function MyTaskRow({
  task,
  seconds,
  isRunning,
  projectPrefix,
  sprintName,
  onClick,
  dragHandleProps,
}: {
  task: TaskWithRelations
  seconds: number
  isRunning: boolean
  projectPrefix: string
  sprintName?: string
  onClick: () => void
  dragHandleProps?: Record<string, unknown>
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-2 text-sm transition-colors hover:bg-muted/40',
        isRunning && 'border-primary/40 bg-primary/5',
      )}
    >
      <span
        {...dragHandleProps}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {isRunning ? (
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-label="Timer running" />
      ) : (
        <PriorityDot priority={task.priority} />
      )}

      <TaskNumberPill taskId={`${projectPrefix}-${task.task_number}`} />

      <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>

      {/* Tags (fixed slot) */}
      <div className="hidden w-[120px] shrink-0 items-center justify-end gap-1 overflow-hidden lg:flex">
        {task.tags?.slice(0, 2).map((tag) => (
          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>

      {/* Status / column (fixed slot) */}
      <div className="hidden w-[88px] shrink-0 justify-center sm:flex">
        {task.column?.name && (
          <span className="max-w-full truncate rounded bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {task.column.name}
          </span>
        )}
      </div>

      {/* Sprint (fixed slot) */}
      <div className="hidden w-[72px] shrink-0 truncate text-[11px] text-muted-foreground xl:block">
        {sprintName ?? ''}
      </div>

      {/* Due date (fixed slot) */}
      <div className="hidden w-[66px] shrink-0 items-center justify-end gap-0.5 text-[11px] text-muted-foreground lg:flex">
        {task.due_date && (
          <>
            <Calendar className="h-3 w-3 shrink-0" />
            {fmtDue(task.due_date)}
          </>
        )}
      </div>

      {/* Story points (fixed slot) */}
      <div className="hidden w-[34px] shrink-0 items-center justify-end gap-0.5 text-[11px] font-medium text-primary md:flex">
        {task.story_points != null && (
          <>
            <Zap className="h-3 w-3 shrink-0" />
            {task.story_points}
          </>
        )}
      </div>

      {/* Counts (fixed slot) */}
      <div className="hidden w-[58px] shrink-0 items-center justify-end gap-2 text-[11px] text-muted-foreground md:flex">
        {(task.comment_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {task.comment_count}
          </span>
        )}
        {(task.attachment_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" />
            {task.attachment_count}
          </span>
        )}
      </div>

      {/* Time tracked (fixed slot) */}
      <span className="w-[52px] shrink-0 text-right font-mono text-xs font-medium tabular-nums text-muted-foreground">
        {formatDuration(seconds)}
      </span>

      <TaskTimerButton taskId={task.id} className="shrink-0" />
    </div>
  )
}
