import { useMemo, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { GanttBar } from './GanttBar'
import { useTasks } from '@/hooks/useTasks'
import { useProjectContext } from '@/contexts/ProjectContext'

const LABEL_W = 220
const ROW_H = 32
const DAY_PX = { day: 34, week: 16 } as const

interface GanttViewProps {
  projectId: string
  onTaskClick: (taskId: string) => void
}

function collapseKey(projectId: string) {
  return `ganttCollapsed:${projectId}`
}

export function GanttView({ projectId, onTaskClick }: GanttViewProps) {
  const { project, columns } = useProjectContext()
  const { data: tasks, isLoading } = useTasks(projectId)
  const [scale, setScale] = useState<'day' | 'week'>('week')
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
    const px = DAY_PX[scale]
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
    return { rangeStart: start, rangeEnd: end, pxPerDay: px, totalWidth: totalDays * px }
  }, [scheduled, scale])

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

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
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
                scale === s ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
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
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <div style={{ minWidth: LABEL_W + totalWidth }}>
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
          <div className="relative">
            {todayVisible && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-0 w-px bg-primary/50"
                style={{ left: LABEL_W + todayLeft }}
              />
            )}

            {columns.map((col) => {
              const rows = scheduled
                .filter((t) => t.column_id === col.id)
                .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))
              const isCollapsed = collapsed[col.id] ?? false
              return (
                <div key={col.id}>
                  {/* Group header */}
                  <div className="flex border-b border-border bg-muted/30">
                    <button
                      onClick={() => toggleCollapse(col.id)}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-muted/30 px-2 py-1.5 text-xs font-semibold text-foreground"
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
                      const taskId = project.prefix
                        ? `${project.prefix}-${task.task_number}`
                        : null
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
              const taskId = project.prefix
                ? `${project.prefix}-${task.task_number}`
                : null
              return (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground hover:bg-muted/50"
                >
                  {taskId && <span className="font-mono text-[10px] text-primary">{taskId}</span>}
                  <span className="max-w-[200px] truncate">{task.title}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Set a start and due date on a task to place it on the timeline.
          </p>
        </div>
      )}
    </div>
  )
}
