import { useId } from 'react'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 24 24" className={cn('h-6 w-6 shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-chart-2)" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#${id})`} />
      <g fill="none" stroke="var(--color-primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 8h11M6.5 12h6M6.5 16h4" opacity="0.6" />
        <path d="M13.5 15l2 2 4-4.5" />
      </g>
    </svg>
  )
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-sm tracking-tight', className)}>
      <LogoMark className={markClassName} />
      <span>
        <span className="font-semibold text-foreground">task</span>
        <span className="font-light bg-linear-to-r from-primary to-chart-2 bg-clip-text text-transparent">manager</span>
      </span>
    </span>
  )
}
