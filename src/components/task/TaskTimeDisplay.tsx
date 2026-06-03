import { useAuth } from '@/contexts/AuthContext'
import { useRunningSession, useTicker } from '@/hooks/useTimeTracking'
import { formatClock, formatDuration, elapsedSeconds } from '@/lib/time-format'
import { cn } from '@/lib/utils'

interface TaskTimeDisplayProps {
  taskId: string
  /**
   * Recorded seconds from this user's CLOSED sessions on the task (excludes the
   * currently-running session, which is added live). Omit on compact surfaces
   * where only the running clock matters.
   */
  baseSeconds?: number
  className?: string
}

/**
 * Time tracked for a task. While this task's timer is running it shows a live
 * per-second clock (HH:MM:SS) that ticks every second via useTicker, so the user
 * sees it move immediately. Otherwise it shows the compact total ("2m"), or
 * nothing when no time is tracked. Reused on board cards, list rows and My Tasks.
 */
export function TaskTimeDisplay({ taskId, baseSeconds = 0, className }: TaskTimeDisplayProps) {
  const { user } = useAuth()
  const { data: running } = useRunningSession(user?.id)
  const isRunning = running?.task_id === taskId
  // Re-render once per second while running so the clock ticks between refetches.
  useTicker(isRunning)

  if (isRunning && running) {
    const live = baseSeconds + elapsedSeconds(running.started_at)
    return (
      <span className={cn('font-mono tabular-nums text-primary', className)} title="Timer running">
        {formatClock(live)}
      </span>
    )
  }

  if (baseSeconds <= 0) return null

  return (
    <span className={cn('font-mono tabular-nums text-muted-foreground', className)}>
      {formatDuration(baseSeconds)}
    </span>
  )
}
