import { Play, Square, GripVertical } from 'lucide-react'
import type { MyWorkTask } from '@/types/database'
import { formatDuration } from '@/lib/time-format'
import { cn } from '@/lib/utils'

interface MyTaskRowProps {
  task: MyWorkTask
  isRunning: boolean
  onStart: (taskId: string) => void
  onStop: () => void
  onToggleComplete: (task: MyWorkTask) => void
  dragHandleProps?: Record<string, unknown>
}

export function MyTaskRow({
  task,
  isRunning,
  onStart,
  onStop,
  onToggleComplete,
  dragHandleProps,
}: MyTaskRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5',
        isRunning && 'border-primary/40 bg-primary/5',
      )}
    >
      <span {...dragHandleProps} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </span>

      <input
        type="checkbox"
        checked={task.is_done}
        onChange={() => onToggleComplete(task)}
        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
        title="Mark complete"
      />

      <span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', task.is_done && 'line-through text-muted-foreground')}>
        {task.title}
      </span>

      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {task.project.prefix}-{task.task_number}
      </span>

      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatDuration(task.total_seconds)}
      </span>

      {isRunning ? (
        <button
          onClick={onStop}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title="Stop timer"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          onClick={() => onStart(task.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          title="Start timer"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
