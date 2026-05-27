import { useQuery } from '@tanstack/react-query'
import {
  fetchSprintSummary,
  fetchSprintBurndown,
  fetchVelocity,
} from '@/services/sprint-analytics'

export const sprintAnalyticsKeys = {
  summary: (sprintId: string) => ['sprint-summary', sprintId] as const,
  burndown: (sprintId: string) => ['sprint-burndown', sprintId] as const,
  velocity: (projectId: string) => ['velocity', projectId] as const,
}

export function useSprintSummary(
  sprintId: string | undefined,
  doneColumnIds: string[]
) {
  return useQuery({
    queryKey: sprintAnalyticsKeys.summary(sprintId ?? ''),
    queryFn: () => fetchSprintSummary(sprintId!, doneColumnIds),
    enabled: !!sprintId,
  })
}

export function useSprintBurndown(
  sprintId: string | undefined,
  doneColumnIds: string[],
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery({
    queryKey: sprintAnalyticsKeys.burndown(sprintId ?? ''),
    queryFn: () =>
      fetchSprintBurndown(sprintId!, doneColumnIds, startDate!, endDate!),
    enabled: !!sprintId && !!startDate && !!endDate,
  })
}

export function useVelocity(projectId: string | undefined) {
  return useQuery({
    queryKey: sprintAnalyticsKeys.velocity(projectId ?? ''),
    queryFn: () => fetchVelocity(projectId!),
    enabled: !!projectId,
  })
}
