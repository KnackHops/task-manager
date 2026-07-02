import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommentReaction } from '@/types/database'

/** Fixed emoji palette offered by the + button (GitHub/Slack style). */
const PALETTE = ['👍', '❤️', '😂', '🎉', '👀', '🙏']

interface ReactionBarProps {
  reactions: CommentReaction[]
  currentUserId: string | undefined
  memberMap: Map<string, { fullName: string; email: string }>
  onToggle: (emoji: string) => void
}

export function ReactionBar({
  reactions,
  currentUserId,
  memberMap,
  onToggle,
}: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  // Group reactions by emoji, tracking count, whether the current user reacted,
  // and who reacted (for the hover tooltip).
  const groups = new Map<string, { count: number; mine: boolean; names: string[] }>()
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { count: 0, mine: false, names: [] }
    g.count++
    if (r.user_id === currentUserId) g.mine = true
    g.names.push(memberMap.get(r.user_id)?.fullName ?? 'Someone')
    groups.set(r.emoji, g)
  }

  const pick = (emoji: string) => {
    onToggle(emoji)
    setPickerOpen(false)
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {[...groups.entries()].map(([emoji, g]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          title={g.names.join(', ')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
            g.mine
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-muted text-muted-foreground hover:bg-accent'
          )}
        >
          <span>{emoji}</span>
          <span className="font-medium tabular-nums">{g.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title="Add reaction"
          className={cn(
            'inline-flex items-center rounded-full border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            groups.size === 0 && 'opacity-0 group-hover:opacity-100'
          )}
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>

        {pickerOpen && (
          <>
            {/* Backdrop closes the picker on outside click */}
            <button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setPickerOpen(false)}
            />
            <div className="absolute left-0 top-full z-20 mt-1 flex gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
              {PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => pick(emoji)}
                  className="rounded p-1 text-base leading-none transition-colors hover:bg-accent"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
