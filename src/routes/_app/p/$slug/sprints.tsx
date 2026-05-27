import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Timer } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useSprints } from '@/hooks/useSprints'
import {
  useSprintSummary,
  useSprintBurndown,
  useVelocity,
} from '@/hooks/useSprintAnalytics'
import { SprintSummaryCard } from '@/components/sprint-analytics/SprintSummaryCard'
import { BurndownChart } from '@/components/sprint-analytics/BurndownChart'
import { VelocityChart } from '@/components/sprint-analytics/VelocityChart'

export const Route = createFileRoute('/_app/p/$slug/sprints')({
  component: SprintAnalyticsPage,
})

function SprintAnalyticsPage() {
  const { project, doneColumnIds } = useProjectContext()
  const { data: sprints, isLoading: sprintsLoading } = useSprints(project.id)

  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )
  const completedSprints = useMemo(
    () => sprints?.filter((s) => s.status === 'completed') ?? [],
    [sprints]
  )

  // Default to active sprint, allow switching
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)

  const viewableSprints = useMemo(() => {
    const list = []
    if (activeSprint) list.push(activeSprint)
    list.push(...completedSprints)
    return list
  }, [activeSprint, completedSprints])

  const currentSprintId = selectedSprintId ?? activeSprint?.id ?? completedSprints[0]?.id
  const currentSprint = viewableSprints.find((s) => s.id === currentSprintId)

  const { data: summary, isLoading: summaryLoading } = useSprintSummary(
    currentSprintId,
    doneColumnIds
  )
  const { data: burndown, isLoading: burndownLoading } = useSprintBurndown(
    currentSprintId,
    doneColumnIds,
    currentSprint?.start_date,
    currentSprint?.end_date
  )
  const { data: velocity, isLoading: velocityLoading } = useVelocity(project.id)

  if (sprintsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-56 w-full" />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    )
  }

  if (!sprints?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Timer className="h-12 w-12 text-primary/40" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">No Sprints</h2>
          <p className="text-sm mt-1">
            Create sprints from the Board page to see analytics here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 overflow-y-auto h-full pb-6">
      {/* Sprint selector */}
      {viewableSprints.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Sprint:</label>
          <select
            value={currentSprintId ?? ''}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="appearance-none rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {viewableSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === 'active' ? ' (active)' : ''}
                {s.status === 'completed' ? ' (completed)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Summary */}
      {currentSprint && summary && (
        <SprintSummaryCard sprint={currentSprint} summary={summary} />
      )}
      {summaryLoading && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Burndown */}
      {burndown && burndown.length > 0 && <BurndownChart data={burndown} />}
      {burndownLoading && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      {/* Velocity */}
      {velocity && <VelocityChart data={velocity} />}
      {velocityLoading && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}
    </div>
  )
}
