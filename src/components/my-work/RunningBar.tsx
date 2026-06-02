import { Square } from 'lucide-react'
import { useRunningSession, useStopTimer, useTicker } from '@/hooks/useTimeTracking'
import { elapsedSeconds, formatClock } from '@/lib/time-format'

export function RunningBar({ userId }: { userId: string }) {
  const { data: running } = useRunningSession(userId)
  const stop = useStopTimer(userId)
  useTicker(!!running) // re-render every second while a timer runs

  if (!running) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        No timer running. Press play on a task to start.
      </div>
    )
  }

  const seconds = elapsedSeconds(running.started_at)
  return (
    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
        <span className="truncate text-sm font-medium text-foreground">
          {running.task?.title ?? 'Running'}
        </span>
        <span className="font-mono text-sm tabular-nums text-primary">
          {formatClock(seconds)}
        </span>
      </div>
      <button
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Square className="h-3.5 w-3.5" /> Stop
      </button>
    </div>
  )
}
