import { useTimeTotals } from '@/hooks/useTimeTracking'
import { formatDuration } from '@/lib/time-format'

export function TimeTotals({ userId }: { userId: string }) {
  const { data } = useTimeTotals(userId)
  const month = new Date().toLocaleString(undefined, { month: 'long' })
  return (
    <div className="flex items-center gap-6 text-sm">
      <div>
        <span className="text-muted-foreground">Today: </span>
        <span className="font-semibold text-foreground">
          {formatDuration(data?.todaySeconds ?? 0)}
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">{month}: </span>
        <span className="font-semibold text-foreground">
          {formatDuration(data?.monthSeconds ?? 0)}
        </span>
      </div>
    </div>
  )
}
