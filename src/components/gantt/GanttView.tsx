import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  parseISO,
  differenceInCalendarDays,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  max as maxDate,
  min as minDate,
} from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn, formatTaskRef } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { GanttBar } from './GanttBar'
import { ScheduleTaskDialog } from './ScheduleTaskDialog'
import { useTasks } from '@/hooks/useTasks'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

const LABEL_W = 220
const ROW_H = 32
const DAY_PX = { day: 34, week: 16 } as const
const MIN_TIMELINE_W = 600

interface GanttViewProps {
  projectId: string
  onTaskClick: (taskId: string) => void
}

function collapseKey(projectId: string) {
  return `ganttCollapsed:${projectId}`
}

export function GanttView({ projectId, onTaskClick }: GanttViewProps) {
  const { project, columns, canEditTask } = useProjectContext()
  const { data: tasks, isLoading } = useTasks(projectId)
  const [scale, setScale] = useState<'day' | 'week'>('week')
  const [scheduleTarget, setScheduleTarget] = useState<{
    task: TaskWithRelations
    startDate: string
    dueDate: string
  } | null>(null)
  const chipDragRef = useRef<{ startX: number; startY: number; moved: boolean; task: TaskWithRelations } | null>(null)
  const timelineBodyRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const [containerW, setContainerW] = useState(0)
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    containerRef.current = node
    if (node) {
      setContainerW(node.clientWidth)
      const ro = new ResizeObserver(([entry]) => {
        if (entry) setContainerW(entry.contentRect.width)
      })
      ro.observe(node)
      roRef.current = ro
    }
  }, [])
  const [dragGhost, setDragGhost] = useState<{ task: TaskWithRelations; x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(collapseKey(projectId))
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })

  const toggleCollapse = (columnId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [columnId]: !prev[columnId] }
      try {
        localStorage.setItem(collapseKey(projectId), JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const { scheduled, unscheduled } = useMemo(() => {
    const active = (tasks ?? []).filter((t) => !t.archived)
    return {
      scheduled: active.filter((t) => t.start_date && t.due_date),
      unscheduled: active.filter((t) => !t.start_date || !t.due_date),
    }
  }, [tasks])

  const { rangeStart, rangeEnd, pxPerDay, totalWidth } = useMemo(() => {
    const basePx = DAY_PX[scale]
    const today = new Date()
    let start: Date
    let end: Date
    if (scheduled.length > 0) {
      const starts = scheduled.map((t) => parseISO(t.start_date!))
      const dues = scheduled.map((t) => parseISO(t.due_date!))
      start = startOfWeek(addDays(minDate(starts), -3), { weekStartsOn: 1 })
      end = endOfWeek(addDays(maxDate(dues), 3), { weekStartsOn: 1 })
    } else {
      start = startOfWeek(addDays(today, -7), { weekStartsOn: 1 })
      end = endOfWeek(addDays(today, 21), { weekStartsOn: 1 })
    }
    const totalDays = differenceInCalendarDays(end, start) + 1
    const availableW = containerW - LABEL_W
    const px = totalDays > 0 && availableW > 0
      ? Math.max(basePx, Math.floor(availableW / totalDays))
      : basePx
    return { rangeStart: start, rangeEnd: end, pxPerDay: px, totalWidth: totalDays * px }
  }, [scheduled, scale, containerW])

  const headerCells = useMemo(() => {
    if (scale === 'day') {
      return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((d) => ({
        key: d.toISOString(),
        w: pxPerDay,
        top: format(d, 'EEEEEE'),
        label: format(d, 'd'),
        today: isToday(d),
      }))
    }
    const weeks: { key: string; w: number; top: string; label: string; today: boolean }[] = []
    let d = rangeStart
    while (d <= rangeEnd) {
      weeks.push({
        key: d.toISOString(),
        w: pxPerDay * 7,
        top: format(d, 'MMM'),
        label: format(d, 'd'),
        today: false,
      })
      d = addDays(d, 7)
    }
    return weeks
  }, [scale, rangeStart, rangeEnd, pxPerDay])

  const todayLeft = differenceInCalendarDays(new Date(), rangeStart) * pxPerDay
  const todayVisible = todayLeft >= 0 && todayLeft <= totalWidth

  /* ── Dependency arrows ── */
  const { taskYMap, bodyHeight } = useMemo(() => {
    const map = new Map<string, number>()
    let y = 0
    for (const col of columns) {
      y += ROW_H // group header
      if (!(collapsed[col.id] ?? false)) {
        const rows = scheduled
          .filter((t) => t.column_id === col.id)
          .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))
        for (const task of rows) {
          map.set(task.id, y + ROW_H / 2)
          y += ROW_H
        }
      }
    }
    return { taskYMap: map, bodyHeight: y }
  }, [columns, scheduled, collapsed])

  const arrows = useMemo(() => {
    const result: { fromId: string; toId: string; fromEndPx: number; toStartPx: number; fromY: number; toY: number; done: boolean }[] = []
    for (const task of scheduled) {
      const toY = taskYMap.get(task.id)
      if (toY === undefined) continue
      for (const dep of task.dependencies ?? []) {
        const fromY = taskYMap.get(dep.id)
        if (fromY === undefined) continue
        const fromTask = scheduled.find((t) => t.id === dep.id)
        if (!fromTask) continue
        const fromEndPx = (differenceInCalendarDays(parseISO(fromTask.due_date!), rangeStart) + 1) * pxPerDay
        const toStartPx = differenceInCalendarDays(parseISO(task.start_date!), rangeStart) * pxPerDay
        result.push({ fromId: dep.id, toId: task.id, fromEndPx, toStartPx, fromY, toY, done: fromTask.is_done })
      }
    }
    return result
  }, [scheduled, taskYMap, rangeStart, pxPerDay])

  /* ── Drag-to-schedule handlers for unscheduled chips ── */
  const DEFAULT_DURATION_DAYS = 3

  const onChipPointerDown = useCallback(
    (e: React.PointerEvent, task: TaskWithRelations) => {
      if (!canEditTask) return
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      chipDragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, task }
    },
    [canEditTask],
  )

  const onChipPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = chipDragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true
    if (drag.moved) setDragGhost({ task: drag.task, x: e.clientX, y: e.clientY })
  }, [])

  const onChipPointerUp = useCallback(
    (e: React.PointerEvent, task: TaskWithRelations) => {
      const drag = chipDragRef.current
      chipDragRef.current = null
      setDragGhost(null)
      if (!drag) return

      if (!drag.moved) {
        onTaskClick(task.id)
        return
      }

      if (!timelineBodyRef.current) return
      const rect = timelineBodyRef.current.getBoundingClientRect()
      const timelineX = e.clientX - rect.left - LABEL_W

      if (timelineX < 0 || timelineX > totalWidth) return

      const dayOffset = Math.floor(timelineX / pxPerDay)
      const startDate = addDays(rangeStart, dayOffset)
      const dueDate = addDays(startDate, DEFAULT_DURATION_DAYS)

      setScheduleTarget({
        task,
        startDate: format(startDate, 'yyyy-MM-dd'),
        dueDate: format(dueDate, 'yyyy-MM-dd'),
      })
    },
    [onTaskClick, rangeStart, pxPerDay, totalWidth],
  )

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <div className="flex-1 rounded-lg border border-border">
          <div className="flex border-b border-border px-3 py-2">
            <Skeleton className="h-4 w-full" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/40 px-3 py-1.5">
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton
                className="h-5 rounded"
                style={{ width: `${30 + ((i * 17) % 40)}%`, marginLeft: `${5 + ((i * 13) % 25)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Scale toggle */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center rounded-lg border border-input p-0.5 text-xs">
          {(['day', 'week'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                'rounded-md px-2.5 py-1 capitalize transition-colors',
                scale === s ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {scheduled.length} scheduled · {unscheduled.length} unscheduled
        </span>
      </div>

      {/* Timeline */}
      <div ref={containerCallbackRef} className="flex-1 overflow-auto rounded-lg border border-border">
        <div style={{ minWidth: LABEL_W + Math.max(totalWidth, MIN_TIMELINE_W) }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-card">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
              style={{ width: LABEL_W }}
            />
            <div className="flex" style={{ width: totalWidth }}>
              {headerCells.map((c) => (
                <div
                  key={c.key}
                  style={{ width: c.w }}
                  className={cn(
                    'shrink-0 border-r border-border/40 py-1 text-center text-[10px] leading-tight',
                    c.today ? 'text-primary font-semibold' : 'text-muted-foreground'
                  )}
                >
                  <div className="opacity-70">{c.top}</div>
                  <div>{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative" ref={timelineBodyRef}>
            {todayVisible && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-0 w-px bg-primary/50"
                style={{ left: LABEL_W + todayLeft }}
              />
            )}

            {/* Dependency arrows */}
            {arrows.length > 0 && (
              <svg className="pointer-events-none absolute top-0 z-5" style={{ left: LABEL_W }} width={totalWidth} height={bodyHeight}>
                <defs>
                  <marker id="dep-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" className="fill-foreground/40" />
                  </marker>
                  <marker id="dep-arrow-done" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" className="fill-emerald-500/60" />
                  </marker>
                </defs>
                {arrows.map(({ fromId, toId, fromEndPx, toStartPx, fromY, toY, done }) => {
                  const midX = (fromEndPx + toStartPx) / 2
                  return (
                    <path
                      key={`${fromId}-${toId}`}
                      d={`M ${fromEndPx} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toStartPx} ${toY}`}
                      fill="none"
                      className={done ? 'stroke-emerald-500/60' : 'stroke-foreground/40'}
                      strokeWidth={1.5}
                      strokeDasharray={done ? '4 2' : undefined}
                      markerEnd={done ? 'url(#dep-arrow-done)' : 'url(#dep-arrow)'}
                    />
                  )
                })}
              </svg>
            )}

            {columns.map((col) => {
              const rows = scheduled
                .filter((t) => t.column_id === col.id)
                .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))
              const isCollapsed = collapsed[col.id] ?? false
              return (
                <div key={col.id}>
                  {/* Group header */}
                  <div className="flex border-b border-border bg-muted/30" style={{ height: ROW_H }}>
                    <button
                      onClick={() => toggleCollapse(col.id)}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-muted/30 px-2 text-xs font-semibold text-foreground"
                      style={{ width: LABEL_W }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {col.name}
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
                        {rows.length}
                      </span>
                    </button>
                    <div style={{ width: totalWidth }} />
                  </div>

                  {/* Task rows */}
                  {!isCollapsed &&
                    rows.map((task) => {
                      const taskId = formatTaskRef(project.prefix, task.task_number)
                      return (
                        <div key={task.id} className="flex border-b border-border/40">
                          <div
                            className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-card px-2"
                            style={{ width: LABEL_W, height: ROW_H }}
                          >
                            {taskId && <TaskNumberPill taskId={taskId} />}
                            <button
                              onClick={() => onTaskClick(task.id)}
                              className="min-w-0 truncate text-left text-xs text-card-foreground hover:text-primary"
                            >
                              {task.title}
                            </button>
                          </div>
                          <div
                            className="relative"
                            style={{ width: totalWidth, height: ROW_H }}
                          >
                            <GanttBar
                              task={task}
                              rangeStart={rangeStart}
                              pxPerDay={pxPerDay}
                              onClick={onTaskClick}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Unscheduled */}
      {unscheduled.length > 0 && (
        <div className="shrink-0 rounded-lg border border-border p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unscheduled ({unscheduled.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((task) => {
              const taskId = formatTaskRef(project.prefix, task.task_number)
              return (
                <button
                  key={task.id}
                  onPointerDown={(e) => onChipPointerDown(e, task)}
                  onPointerMove={onChipPointerMove}
                  onPointerUp={(e) => onChipPointerUp(e, task)}
                  onPointerCancel={() => { chipDragRef.current = null; setDragGhost(null) }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground hover:bg-muted/50 touch-none',
                    canEditTask && 'cursor-grab active:cursor-grabbing active:opacity-60',
                  )}
                >
                  {taskId && <span className="font-mono text-[10px] text-primary">{taskId}</span>}
                  <span className="max-w-[200px] truncate">{task.title}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {canEditTask
              ? 'Drag a task onto the timeline to schedule it, or click to open details.'
              : 'Set a start and due date on a task to place it on the timeline.'}
          </p>
        </div>
      )}

      {scheduleTarget && (
        <ScheduleTaskDialog
          task={scheduleTarget.task}
          defaultStartDate={scheduleTarget.startDate}
          defaultDueDate={scheduleTarget.dueDate}
          onClose={() => setScheduleTarget(null)}
          projectId={projectId}
        />
      )}

      {dragGhost &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground opacity-70 shadow-lg"
            style={{ left: dragGhost.x + 8, top: dragGhost.y - 14 }}
          >
            <span className="font-mono text-[10px] text-primary">
              {formatTaskRef(project.prefix, dragGhost.task.task_number)}
            </span>
            <span className="max-w-[200px] truncate">{dragGhost.task.title}</span>
          </div>,
          document.body,
        )}
    </div>
  )
}
