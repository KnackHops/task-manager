import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { filterMembers } from '@/lib/mentions'
import { Avatar } from '@/components/ui/Avatar'
import type { ProjectMemberWithProfile } from '@/types/database'

interface MentionDropdownProps {
  members: ProjectMemberWithProfile[]
  query: string
  onSelect: (member: ProjectMemberWithProfile) => void
  onClose: () => void
  visible: boolean
}

export function MentionDropdown({
  members,
  query,
  onSelect,
  onClose,
  visible,
}: MentionDropdownProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const filtered = filterMembers(members, query)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!visible) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filtered[activeIndex]) {
          onSelect(filtered[activeIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, activeIndex, filtered, onSelect, onClose])

  if (!visible || filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
      {filtered.slice(0, 5).map((m, i) => (
        <button
          key={m.user_id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(m)
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            i === activeIndex ? 'bg-primary/10' : 'hover:bg-muted'
          )}
        >
          <Avatar
            name={m.profile.full_name}
            url={m.profile.avatar_url}
            size="sm"
          />
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate font-medium text-foreground">
              {m.profile.full_name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {m.profile.email}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
