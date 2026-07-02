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
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      // navigator.clipboard is undefined outside secure contexts (HTTP/LAN IP),
      // so fall back to execCommand there.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(taskId)
      } else {
        const ta = document.createElement('textarea')
        ta.value = taskId
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success(`Copied ${taskId}`)
    } catch {
      toast.error('Copy failed')
    }
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
