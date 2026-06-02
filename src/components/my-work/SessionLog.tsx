import { useSessionLog } from '@/hooks/useTimeTracking'
import { formatDuration } from '@/lib/time-format'
import type { SessionLogFilters } from '@/types/database'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Chronological per-entry log. Pass `userId` for an own-log (My Work) or `projectId`
 * for a project team feed. Each row is one start/stop session — repeats are not merged.
 */
export function SessionLog({ filters }: { filters: SessionLogFilters }) {
  const { data: sessions, isLoading } = useSessionLog(filters)

  if (isLoading) return <p className="px-1 py-4 text-sm text-muted-foreground">Loading…</p>
  if (!sessions || sessions.length === 0)
    return <p className="px-1 py-4 text-sm text-muted-foreground">No time logged yet.</p>

  return (
    <div className="divide-y divide-border">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-24 shrink-0 truncate text-muted-foreground">{s.user.full_name}</span>
          <span className="min-w-0 flex-1 truncate text-foreground">{s.task?.title ?? '—'}</span>
          <span className="w-12 shrink-0 text-muted-foreground">{fmtDate(s.started_at)}</span>
          <span className="w-32 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {fmtTime(s.started_at)} → {s.ended_at ? fmtTime(s.ended_at) : '…'}
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
            {formatDuration(s.duration_seconds)}
          </span>
        </div>
      ))}
    </div>
  )
}
