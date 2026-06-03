/**
 * Tiptap mention suggestion renderer.
 * Renders a floating dropdown when user types @ in the editor.
 * Uses a portal to position the dropdown at the cursor location.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { filterMembers } from '@/lib/mentions'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { ProjectMemberWithProfile } from '@/types/database'

interface MentionListProps {
  items: ProjectMemberWithProfile[]
  command: (attrs: { id: string; label: string }) => void
}

function MentionList({ items, command }: MentionListProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActiveIndex(0)
  }, [items])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const member = items[activeIndex]
        if (member) {
          command({ id: member.user_id, label: member.profile.full_name })
        }
      }
    },
    [items, activeIndex, command],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  if (items.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      {items.slice(0, 5).map((m, i) => (
        <button
          key={m.user_id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            command({ id: m.user_id, label: m.profile.full_name })
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            i === activeIndex ? 'bg-primary/10' : 'hover:bg-muted',
          )}
        >
          <Avatar name={m.profile.full_name} url={m.profile.avatar_url} size="sm" />
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate font-medium capitalize text-foreground">
              {m.profile.full_name}
            </div>
            <div className="truncate text-xs text-muted-foreground">{m.profile.email}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

/** Create suggestion config for Tiptap Mention extension. */
export function createMentionSuggestion(
  members: ProjectMemberWithProfile[],
): Partial<SuggestionOptions> {
  return {
    char: '@',
    items: ({ query }) => filterMembers(members, query),

    render: () => {
      let container: HTMLDivElement | null = null
      let root: ReturnType<typeof createRoot> | null = null

      return {
        onStart: (props: SuggestionProps<ProjectMemberWithProfile>) => {
          container = document.createElement('div')
          container.style.position = 'absolute'
          container.style.zIndex = '50'

          const rect = props.clientRect?.()
          if (rect) {
            container.style.left = `${rect.left}px`
            container.style.top = `${rect.bottom + 4}px`
          }

          document.body.appendChild(container)
          root = createRoot(container)
          root.render(
            <MentionList items={props.items as ProjectMemberWithProfile[]} command={props.command} />,
          )
        },

        onUpdate: (props: SuggestionProps<ProjectMemberWithProfile>) => {
          if (!container || !root) return

          const rect = props.clientRect?.()
          if (rect) {
            container.style.left = `${rect.left}px`
            container.style.top = `${rect.bottom + 4}px`
          }

          root.render(
            <MentionList items={props.items as ProjectMemberWithProfile[]} command={props.command} />,
          )
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            return true
          }
          // ArrowDown, ArrowUp, Enter, Tab handled by MentionList keydown listener
          if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(props.event.key)) {
            return true
          }
          return false
        },

        onExit: () => {
          if (root) {
            root.unmount()
            root = null
          }
          if (container) {
            container.remove()
            container = null
          }
        },
      }
    },
  }
}
