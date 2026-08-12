import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import type { ProjectMemberWithProfile } from '@/types/database'

interface AssigneeSelectProps {
  members: ProjectMemberWithProfile[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  label?: string
  position?: 'top' | 'bottom'
  disabled?: boolean
}

export function AssigneeSelect({
  members,
  selectedIds,
  onChange,
  label,
  position = 'bottom',
  disabled = false,
}: AssigneeSelectProps) {
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

  const selectedMembers = members.filter((m) => selectedIds.includes(m.user_id))

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
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selectedMembers.length === 0 ? (
            <span className="text-muted-foreground">Select assignees...</span>
          ) : (
            selectedMembers.map((m) => (
              <span
                key={m.user_id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar
                  name={m.profile.full_name}
                  url={m.profile.avatar_url}
                  size="sm"
                  className="h-4 w-4 text-[8px]"
                />
                {m.profile.full_name}
                <button
                  type="button"
                  onClick={() => toggle(m.user_id)}
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
        <div className={cn(
          "absolute z-50 w-full rounded-lg border border-border bg-popover p-1 shadow-lg",
          position === 'top' ? 'bottom-full mb-1' : 'mt-1'
        )}>
          {members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => toggle(m.user_id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                selectedIds.includes(m.user_id)
                  ? 'bg-primary/10'
                  : 'hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'h-3.5 w-3.5 rounded border shrink-0',
                  selectedIds.includes(m.user_id)
                    ? 'border-primary bg-primary'
                    : 'border-input'
                )}
              >
                {selectedIds.includes(m.user_id) && (
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
              <Avatar
                name={m.profile.full_name}
                url={m.profile.avatar_url}
                size="sm"
              />
              <span className="truncate capitalize">{m.profile.full_name}</span>
            </button>
          ))}
          {members.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No members
            </p>
          )}
        </div>
      )}
    </div>
  )
}
