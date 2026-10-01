import { cn } from '@/lib/utils'
import { PriorityDot, TAG_COLOR_MAP } from '@/components/ui/Badge'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { BoardFilter } from '@/hooks/useBoardDnd'
import type { TaskPriority } from '@/types/database'

const PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low']

const chip = (active: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors',
    active ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : 'opacity-60 hover:opacity-100'
  )

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

interface BoardFilterBarProps {
  value: BoardFilter
  onChange: (value: BoardFilter) => void
}

export function BoardFilterBar({ value, onChange }: BoardFilterBarProps) {
  const { tags } = useProjectContext()
  const hasFilter = value.priorities.length > 0 || value.tagIds.length > 0

  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
      {PRIORITIES.map((p) => (
        <button
          key={p}
          onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p) })}
          className={cn(chip(value.priorities.includes(p)), 'bg-muted text-foreground')}
        >
          <PriorityDot priority={p} />
          {p}
        </button>
      ))}
      {tags.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => onChange({ ...value, tagIds: toggle(value.tagIds, tag.id) })}
          className={cn(chip(value.tagIds.includes(tag.id)), TAG_COLOR_MAP[tag.color] ?? 'bg-muted text-muted-foreground')}
        >
          {tag.name}
        </button>
      ))}
      {hasFilter && (
        <button
          onClick={() => onChange({ priorities: [], tagIds: [] })}
          className="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}
