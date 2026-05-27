import { differenceInCalendarDays, parseISO, format } from 'date-fns'
import type { Sprint } from '@/types/database'
import type { SprintSummary } from '@/services/sprint-analytics'

interface SprintSummaryCardProps {
  sprint: Sprint
  summary: SprintSummary
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
}

export function SprintSummaryCard({ sprint, summary }: SprintSummaryCardProps) {
  const start = parseISO(sprint.start_date)
  const end = parseISO(sprint.end_date)
  const today = new Date()
  const totalDays = differenceInCalendarDays(end, start)
  const daysElapsed = Math.min(
    differenceInCalendarDays(today, start),
    totalDays
  )
  const daysRemaining = Math.max(totalDays - daysElapsed, 0)

  const taskPercent =
    summary.totalTasks > 0
      ? Math.round((summary.doneTasks / summary.totalTasks) * 100)
      : 0
  const pointsDenominator = sprint.story_points_target ?? summary.totalPoints
  const pointPercent =
    pointsDenominator > 0
      ? Math.round((summary.donePoints / pointsDenominator) * 100)
      : 0

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {sprint.name}
          </h3>
          {sprint.goal && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {sprint.goal}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>
            {format(start, 'MMM d')} — {format(end, 'MMM d')}
          </div>
          {sprint.status === 'active' && (
            <div className="mt-0.5 font-medium text-foreground">
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
            </div>
          )}
          {sprint.status === 'completed' && (
            <div className="mt-0.5 font-medium text-emerald-500">
              Completed
            </div>
          )}
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Tasks</span>
            <span className="text-foreground font-medium">
              {summary.doneTasks}/{summary.totalTasks} ({taskPercent}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${taskPercent}%` }}
            />
          </div>
        </div>

        {(summary.totalPoints > 0 || sprint.story_points_target) && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                Story Points
                {sprint.story_points_target != null && (
                  <span className="text-primary/70 ml-1">
                    (target: {sprint.story_points_target})
                  </span>
                )}
              </span>
              <span className="text-foreground font-medium">
                {summary.donePoints}/{pointsDenominator} ({Math.min(pointPercent, 100)}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(pointPercent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Priority breakdown */}
      <div className="flex gap-3">
        {PRIORITY_ORDER.map((p) => {
          const data = summary.tasksByPriority[p]
          if (!data || data.total === 0) return null
          return (
            <div key={p} className="flex items-center gap-1.5 text-xs">
              <div className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[p]}`} />
              <span className="text-muted-foreground capitalize">{p}</span>
              <span className="text-foreground font-medium">
                {data.done}/{data.total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
