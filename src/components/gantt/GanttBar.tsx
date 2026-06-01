import { useEffect, useRef, useState } from 'react'
import { parseISO, differenceInCalendarDays, addDays, format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useUpdateTask } from '@/hooks/useTasks'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

const priorityBar: Record<string, string> = {
  critical: 'bg-red-500/80 hover:bg-red-500',
  high: 'bg-orange-500/80 hover:bg-orange-500',
  medium: 'bg-yellow-500/80 hover:bg-yellow-500',
  low: 'bg-slate-500/80 hover:bg-slate-500',
}

interface GanttBarProps {
  task: TaskWithRelations
  rangeStart: Date
  pxPerDay: number
  onClick: (taskId: string) => void
}

type DragMode = 'move' | 'left' | 'right'

export function GanttBar({ task, rangeStart, pxPerDay, onClick }: GanttBarProps) {
  const { project, canEditTask } = useProjectContext()
  const updateTask = useUpdateTask(project.id)

  const start = parseISO(task.start_date!)
  const due = parseISO(task.due_date!)
  const startOffset = differenceInCalendarDays(start, rangeStart)
  const duration = differenceInCalendarDays(due, start) + 1

  // Preview deltas (in days) applied live while dragging
  const [preview, setPreview] = useState<{ ds: number; de: number } | null>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; moved: boolean } | null>(null)

  // Clear preview when task dates update from cache (avoids flicker)
  useEffect(() => { setPreview(null) }, [task.start_date, task.due_date])

  const effOffset = startOffset + (preview?.ds ?? 0)
  const effDuration = duration + ((preview?.de ?? 0) - (preview?.ds ?? 0))
  const left = effOffset * pxPerDay
  const width = Math.max(effDuration, 1) * pxPerDay

  const beginDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!canEditTask) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dayDelta = Math.round((e.clientX - drag.startX) / pxPerDay)
    if (dayDelta !== 0) drag.moved = true
    if (drag.mode === 'move') {
      setPreview({ ds: dayDelta, de: dayDelta })
    } else if (drag.mode === 'left') {
      // can't move start past due
      setPreview({ ds: Math.min(dayDelta, duration - 1), de: 0 })
    } else {
      // can't move due before start
      setPreview({ ds: 0, de: Math.max(dayDelta, -(duration - 1)) })
    }
  }

  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (!drag.moved) {
      setPreview(null)
      onClick(task.id)
      return
    }
    const p = preview
    if (!p) { setPreview(null); return }
    let newStart = addDays(start, p.ds)
    let newDue = addDays(due, p.de)
    if (newDue < newStart) newDue = newStart
    updateTask.mutate({
      taskId: task.id,
      input: { start_date: format(newStart, 'yyyy-MM-dd'), due_date: format(newDue, 'yyyy-MM-dd') },
    })
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={beginDrag('move')}
      onClick={(e) => {
        // pointer flow handles clicks; guard the non-edit case
        if (!canEditTask) onClick(task.id)
        e.stopPropagation()
      }}
      style={{ left, width }}
      className={cn(
        'group/bar absolute top-1 flex h-6 items-center rounded px-2 text-[11px] font-medium text-white shadow-sm',
        priorityBar[task.priority] ?? 'bg-primary/80',
        canEditTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        task.is_done && 'opacity-60'
      )}
      title={`${task.title} · ${task.start_date} → ${task.due_date}`}
    >
      {canEditTask && (
        <span
          onPointerDown={beginDrag('left')}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l"
        />
      )}
      <span className={cn('truncate', task.is_done && 'line-through')}>{task.title}</span>
      {canEditTask && (
        <span
          onPointerDown={beginDrag('right')}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r"
        />
      )}
    </div>
  )
}
