import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TagBadge } from './Badge'
import type { ProjectTag } from '@/types/database'

interface TagSelectProps {
  tags: ProjectTag[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  label?: string
  disabled?: boolean
}

export function TagSelect({
  tags,
  selectedIds,
  onChange,
  label,
  disabled = false,
}: TagSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id))

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
          {label}
        </label>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(!open)
          }
        }}
        className={cn(
          'flex min-h-[40px] w-full items-center gap-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground">Select tags...</span>
          ) : (
            selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <TagBadge name={tag.name} color={tag.color} />
                <button
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover p-1 shadow-lg">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                selectedIds.includes(tag.id)
                  ? 'bg-primary/10'
                  : 'hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'h-3.5 w-3.5 rounded border',
                  selectedIds.includes(tag.id)
                    ? 'border-primary bg-primary'
                    : 'border-input'
                )}
              >
                {selectedIds.includes(tag.id) && (
                  <svg
                    className="h-3.5 w-3.5 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <TagBadge name={tag.name} color={tag.color} />
            </button>
          ))}
          {tags.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags defined
            </p>
          )}
        </div>
      )}
    </div>
  )
}
