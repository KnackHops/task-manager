import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { GripVertical, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PriorityBadge } from '@/components/ui/Badge'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { useUpdateTask } from '@/hooks/useTasks'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

type Priority = TaskWithRelations['priority']
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

interface TaskListRowProps {
  task: TaskWithRelations
  index: number
  onClick: (taskId: string) => void
}

export function TaskListRow({ task, index, onClick }: TaskListRowProps) {
  const { project, columns, doneColumnIds, canEditTask } = useProjectContext()
  const updateTask = useUpdateTask(project.id)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)

  const taskId = project.prefix ? `${project.prefix}-${task.task_number}` : null
  const inDoneColumn = doneColumnIds.includes(task.column_id)

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
    updateTask.mutate({
      taskId: task.id,
      input: {
        column_id: columnId,
        ...(toDone ? { is_done: true, done_at: new Date().toISOString() } : {}),
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
              disabled={inDoneColumn || updateTask.isPending}
              onClick={stop}
              onChange={toggleDone}
              title={inDoneColumn ? 'Task is in a done column' : 'Mark as done'}
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
            <>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-card-foreground',
                  task.is_done && 'text-muted-foreground line-through'
                )}
              >
                {task.title}
              </span>
              {canEditTask && (
                <button
                  onClick={startEdit}
                  title="Rename"
                  className="shrink-0 text-muted-foreground/0 transition-colors hover:text-foreground group-hover:text-muted-foreground/60"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}

          {canEditTask ? (
            <select
              value={task.priority}
              onClick={stop}
              onChange={(e) => changePriority(e.target.value as Priority)}
              className="shrink-0 cursor-pointer rounded bg-transparent text-xs text-muted-foreground focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <PriorityBadge priority={task.priority} className="shrink-0" />
          )}

          {canEditTask ? (
            <select
              value={task.column_id}
              onClick={stop}
              onChange={(e) => changeColumn(e.target.value)}
              className="max-w-[120px] shrink-0 cursor-pointer rounded bg-transparent text-xs text-muted-foreground focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              {columns.find((c) => c.id === task.column_id)?.name}
            </span>
          )}
        </div>
      )}
    </Draggable>
  )
}
