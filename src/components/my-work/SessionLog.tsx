import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Clock, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useSessionLog } from '@/hooks/useTimeTracking'
import { formatDuration } from '@/lib/time-format'
import { Skeleton } from '@/components/ui/Skeleton'
import type { SessionLogFilters, TimeSessionWithTask } from '@/types/database'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface TaskGroup {
  key: string
  title: string
  sessions: TimeSessionWithTask[]
  totalSeconds: number
  isRunning: boolean
}

interface ProjectGroup {
  id: string
  name: string
  tasks: TaskGroup[]
  totalSeconds: number
  sessionCount: number
}

/**
 * Cross-project session log as one card per project. Within each card, sessions are
 * grouped by task (expand a task to see its individual start/stop entries). Projects
 * and tasks are both sorted by total time, most-tracked first.
 */
export function SessionLog({ filters }: { filters: SessionLogFilters }) {
  const { data: sessions, isLoading } = useSessionLog(filters)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const projects = useMemo<ProjectGroup[]>(() => {
    const pmap = new Map<
      string,
      { id: string; name: string; tasks: Map<string, TaskGroup>; total: number; count: number }
    >()
    for (const s of sessions ?? []) {
      const pid = s.task?.project.id ?? 'unknown'
      let p = pmap.get(pid)
      if (!p) {
        p = { id: pid, name: s.task?.project.name ?? '—', tasks: new Map(), total: 0, count: 0 }
        pmap.set(pid, p)
      }
      const tkey = s.task_id ?? 'unknown'
      let t = p.tasks.get(tkey)
      if (!t) {
        t = { key: tkey, title: s.task?.title ?? '—', sessions: [], totalSeconds: 0, isRunning: false }
        p.tasks.set(tkey, t)
      }
      t.sessions.push(s)
      t.totalSeconds += s.duration_seconds
      if (!s.ended_at) t.isRunning = true
      p.total += s.duration_seconds
      p.count += 1
    }
    return [...pmap.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        totalSeconds: p.total,
        sessionCount: p.count,
        tasks: [...p.tasks.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
  }, [sessions])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Skeleton className="h-4 w-32" />
              <div className="flex-1" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="space-y-3 px-3 py-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-2/5" />
                  <div className="flex-1" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No time logged yet</p>
        <p className="text-xs text-muted-foreground">Start a timer on a task and entries will appear here.</p>
      </div>
    )
  }

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleProject = (p: ProjectGroup) => {
    const keys = p.tasks.map((t) => t.key)
    const open = keys.length > 0 && keys.every((k) => expanded.has(k))
    setExpanded((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (open ? next.delete(k) : next.add(k)))
      return next
    })
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {projects.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">{p.name}</span>
              <button
                onClick={() => toggleProject(p)}
                title={p.tasks.every((t) => expanded.has(t.key)) ? 'Collapse all' : 'Expand all'}
                aria-label="Toggle all tasks"
                className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {p.tasks.every((t) => expanded.has(t.key)) ? (
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {p.sessionCount} {p.sessionCount === 1 ? 'session' : 'sessions'}
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatDuration(p.totalSeconds)}
            </span>
          </div>

          <div className="divide-y divide-border/60 px-3">
            {p.tasks.map((t) => {
              const open = expanded.has(t.key)
              return (
                <div key={t.key}>
                  <button
                    onClick={() => toggle(t.key)}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/30"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    {t.isRunning && (
                      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-label="Timer running" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.sessions.length} {t.sessions.length === 1 ? 'session' : 'sessions'}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-xs font-medium tabular-nums text-foreground">
                      {formatDuration(t.totalSeconds)}
                    </span>
                  </button>

                  {open && (
                    <div className="pb-2 pl-6">
                      {t.sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 py-1 text-xs">
                          <span className="w-12 shrink-0 text-muted-foreground">{fmtDate(s.started_at)}</span>
                          <span className="flex-1 font-mono tabular-nums text-muted-foreground">
                            {fmtTime(s.started_at)} →{' '}
                            {s.ended_at ? fmtTime(s.ended_at) : <span className="font-sans text-primary">running</span>}
                          </span>
                          <span className="w-14 shrink-0 text-right font-mono font-medium tabular-nums text-foreground">
                            {formatDuration(s.duration_seconds)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
