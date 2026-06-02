import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { TaskPriority } from '@/types/database'

const priorityVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      priority: {
        critical: 'bg-red-500/20 text-red-400',
        high: 'bg-orange-500/20 text-orange-400',
        medium: 'bg-yellow-500/20 text-yellow-400',
        low: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      priority: 'medium',
    },
  }
)

export function PriorityBadge({
  priority,
  className,
}: VariantProps<typeof priorityVariants> & { className?: string }) {
  return (
    <span className={cn(priorityVariants({ priority }), className)}>
      {priority}
    </span>
  )
}

// Compact priority indicator dot — same palette as PriorityBadge, for dense rows.
const priorityDotColors: Record<TaskPriority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-muted-foreground/40',
}

export function PriorityDot({
  priority,
  className,
}: {
  priority: TaskPriority
  className?: string
}) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', priorityDotColors[priority], className)}
      title={`${priority} priority`}
      aria-label={`${priority} priority`}
    />
  )
}

// Dynamic tag badge — color comes from tag data, not static variants
export const TAG_COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  green: 'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  orange: 'bg-orange-500/20 text-orange-400',
  purple: 'bg-purple-500/20 text-purple-400',
  pink: 'bg-pink-500/20 text-pink-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  gray: 'bg-muted text-muted-foreground',
}

export function TagBadge({
  name,
  color,
  className,
}: {
  name: string
  color: string
  className?: string
}) {
  const colorClass =
    TAG_COLOR_MAP[color] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {name}
    </span>
  )
}

export const TAG_COLORS = Object.keys(TAG_COLOR_MAP)
