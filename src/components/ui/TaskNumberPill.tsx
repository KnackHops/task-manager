import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Bold, pill-styled task ID (e.g. "NT-6"). Click copies the ID to the clipboard.
 * Stops click propagation so it never triggers a parent row/card click
 * (open-details) or drag.
 */
export function TaskNumberPill({
  taskId,
  className,
}: {
  taskId: string
  className?: string
}) {
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard
      .writeText(taskId)
      .then(() => toast.success(`Copied ${taskId}`))
      .catch(() => toast.error('Copy failed'))
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${taskId}`}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary transition-colors hover:bg-primary/20',
        className
      )}
    >
      {taskId}
    </button>
  )
}
