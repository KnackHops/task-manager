import { useState, useRef, type ReactNode } from 'react'

interface MentionPopoverProps {
  name: string
  email: string | null
  children: ReactNode
}

export function MentionPopover({ name, email, children }: MentionPopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  return (
    <span
      ref={ref}
      className="relative inline"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="absolute bottom-full left-0 z-50 mb-1 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
          <span className="block text-sm font-medium text-foreground">
            {name}
          </span>
          {email && (
            <span className="block text-xs text-muted-foreground">
              {email}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
