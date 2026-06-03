import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { GitMerge, GripVertical, Pencil, MessageSquare, Paperclip, Zap } from 'lucide-react'
import { cn, formatTaskRef } from '@/lib/utils'
import { PriorityBadge, TagBadge } from '@/components/ui/Badge'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { Avatar } from '@/components/ui/Avatar'
import { TaskTimerButton } from '@/components/task/TaskTimerButton'
import { TaskTimeDisplay } from '@/components/task/TaskTimeDisplay'
import { useUpdateTask } from '@/hooks/useTasks'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

type Priority = TaskWithRelations['priority']
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

interface TaskListRowProps {
  task: TaskWithRelations
  index: number
  /** This user's closed-session seconds on the task; the running clock is added live. */
  seconds?: number
  onClick: (taskId: string) => void
}

export function TaskListRow({ task, index, seconds = 0, onClick }: TaskListRowProps) {
  const { project, columns, doneColumnIds, canEditTask } = useProjectContext()
  const updateTask = useUpdateTask(project.id)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)

  const taskId = formatTaskRef(project.prefix, task.task_number)
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  const startEdit = (e: React.MouseEvent) => {
    stop(e)
    setTitleDraft(task.title)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== task.title) {
      updateTask.mutate({ taskId: task.id, input: { title: next } })
    } else {
      setTitleDraft(task.title)
    }
  }

  const changePriority = (priority: Priority) => {
    if (priority !== task.priority) {
      updateTask.mutate({ taskId: task.id, input: { priority } })
    }
  }

  const changeColumn = (columnId: string) => {
    if (columnId === task.column_id) return
    const toDone = doneColumnIds.includes(columnId)
    const fromDone = doneColumnIds.includes(task.column_id)
    updateTask.mutate({
      taskId: task.id,
      input: {
        column_id: columnId,
        ...(toDone
          ? { is_done: true, done_at: new Date().toISOString() }
          : fromDone
            ? { is_done: false, done_at: null }
            : {}),
      },
    })
  }

  const toggleDone = () => {
    updateTask.mutate({
      taskId: task.id,
      input: task.is_done
        ? { is_done: false, done_at: null }
        : { is_done: true, done_at: new Date().toISOString() },
    })
  }

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canEditTask}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style}
          onClick={() => onClick(task.id)}
          className={cn(
            'group flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm transition-shadow hover:bg-muted/50 cursor-pointer',
            snapshot.isDragging && 'shadow-lg ring-2 ring-primary/30'
          )}
        >
          {canEditTask && (
            <span
              {...provided.dragHandleProps}
              onClick={stop}
              className="shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground"
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}

          {canEditTask ? (
            <input
              type="checkbox"
              checked={task.is_done}
              disabled={updateTask.isPending}
              onClick={stop}
              onChange={toggleDone}
              title="Mark as done"
              className="shrink-0 accent-emerald-500 disabled:opacity-40"
            />
          ) : (
            <input
              type="checkbox"
              checked={task.is_done}
              readOnly
              className="pointer-events-none shrink-0 accent-emerald-500"
            />
          )}

          {taskId && <TaskNumberPill taskId={taskId} />}

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onClick={stop}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                stop(e)
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setTitleDraft(task.title)
                  setEditingTitle(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  'min-w-0 truncate text-card-foreground',
                  task.is_done && 'text-muted-foreground line-through'
                )}
              >
                {task.title}
              </span>
              {task.tags && task.tags.length > 0 && (
                <div className="hidden shrink-0 items-center gap-1 sm:flex">
                  {task.tags.slice(0, 2).map((tag) => (
                    <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                  {task.tags.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{task.tags.length - 2}
                    </span>
                  )}
                </div>
              )}
              {canEditTask && (
                <button
                  onClick={startEdit}
                  title="Rename"
                  className="shrink-0 text-muted-foreground/0 transition-colors hover:text-foreground group-hover:text-muted-foreground/60"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Activity column: counts · points · assignees (right-aligned, fixed slot) */}
          <div className="hidden w-[92px] shrink-0 items-center justify-end gap-2 sm:flex">
            {(task.comment_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {task.comment_count}
              </span>
            )}
            {(task.attachment_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {task.attachment_count}
              </span>
            )}
            {task.story_points != null && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
                <Zap className="h-3 w-3" />
                {task.story_points}
              </span>
            )}
          </div>

          {/* Assignees (fixed slot) */}
          <div className="hidden w-[58px] shrink-0 justify-end sm:flex">
            {task.assignees && task.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {task.assignees.slice(0, 2).map((a) => (
                  <Avatar
                    key={a.id}
                    name={a.full_name}
                    url={a.avatar_url}
                    size="sm"
                    className="ring-2 ring-card"
                  />
                ))}
                {task.assignees.length > 2 && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                    +{task.assignees.length - 2}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dependencies */}
          {task.dependencies && task.dependencies.length > 0 && (
            <div className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground md:flex">
              <GitMerge className={cn('h-3 w-3 shrink-0', task.dependencies.every((d) => d.is_done) && 'text-emerald-500')} />
              {task.dependencies.slice(0, 3).map((d) => (
                <span key={d.id} className={cn(d.is_done && 'text-emerald-500')}>{formatTaskRef(project.prefix, d.task_number)}</span>
              ))}
              {task.dependencies.length > 3 && (
                <span
                  className="cursor-pointer text-muted-foreground"
                  title={task.dependencies.slice(3).map((d) => formatTaskRef(project.prefix, d.task_number)).join(', ')}
                >
                  +{task.dependencies.length - 3}
                </span>
              )}
            </div>
          )}

          {canEditTask ? (
            <select
              value={task.priority}
              onClick={stop}
              onChange={(e) => changePriority(e.target.value as Priority)}
              className="w-[88px] shrink-0 cursor-pointer rounded bg-transparent text-xs capitalize text-muted-foreground focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <PriorityBadge priority={task.priority} className="w-[88px] shrink-0 justify-center capitalize" />
          )}

          {canEditTask ? (
            <select
              value={task.column_id}
              onClick={stop}
              onChange={(e) => changeColumn(e.target.value)}
              className="w-[104px] shrink-0 cursor-pointer rounded bg-transparent text-xs text-muted-foreground focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="w-[104px] shrink-0 truncate text-xs text-muted-foreground">
              {columns.find((c) => c.id === task.column_id)?.name}
            </span>
          )}

          <div className="flex w-[68px] shrink-0 justify-end text-xs">
            <TaskTimeDisplay taskId={task.id} baseSeconds={seconds} />
          </div>

          <TaskTimerButton taskId={task.id} className="shrink-0" />
        </div>
      )}
    </Draggable>
  )
}
