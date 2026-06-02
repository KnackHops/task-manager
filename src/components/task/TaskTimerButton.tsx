import type { MouseEvent } from 'react'
import { Play, Square } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRunningSession, useStartTimer, useStopTimer } from '@/hooks/useTimeTracking'
import { cn } from '@/lib/utils'

interface TaskTimerButtonProps {
  taskId: string
  /** `icon` = compact square (board cards / rows); `labeled` = bordered button with text (detail panel). */
  variant?: 'icon' | 'labeled'
  className?: string
}

/**
 * Start/stop the personal work timer for a single task. Only one timer runs at a time —
 * starting this one auto-stops any other (enforced by the start_task_timer RPC).
 * `useRunningSession` shares one cache entry across every mounted button (TanStack Query
 * dedupes by key), so rendering this on many board cards costs a single query.
 */
export function TaskTimerButton({ taskId, variant = 'icon', className }: TaskTimerButtonProps) {
  const { user } = useAuth()
  const userId = user?.id
  const { data: running } = useRunningSession(userId)
  const start = useStartTimer(userId)
  const stop = useStopTimer(userId)

  const isRunning = running?.task_id === taskId
  const busy = start.isPending || stop.isPending

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    if (isRunning) stop.mutate()
    else start.mutate(taskId)
  }

  const label = isRunning ? 'Stop timer' : 'Start timer'

  if (variant === 'labeled') {
    return (
      <button
        onClick={handleClick}
        disabled={busy}
        title={label}
        aria-label={label}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50',
          isRunning
            ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border-border text-muted-foreground hover:bg-muted',
          className,
        )}
      >
        {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{isRunning ? 'Stop' : 'Start'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50',
        isRunning
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'text-muted-foreground hover:bg-muted hover:text-primary',
        className,
      )}
    >
      {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
    </button>
  )
}
