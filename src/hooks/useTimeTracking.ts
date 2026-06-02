import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  startTimer,
  stopTimer,
  getRunningSession,
  getTaskTotal,
  getTotals,
  getProjectTotals,
  getProjectTaskSeconds,
  getSprintTotal,
  listSessions,
} from '@/services/time-sessions'
import { setTaskRank, getTaskRanks } from '@/services/user-task-order'
import type { SessionLogFilters } from '@/types/database'

export const timeKeys = {
  running: (userId: string) => ['running-session', userId] as const,
  totals: (userId: string) => ['time-totals', userId] as const,
  projectTotals: (userId: string, projectId: string) => ['project-totals', userId, projectId] as const,
  sprintTotal: (userId: string, sprintId: string) => ['sprint-total', userId, sprintId] as const,
  taskTotal: (userId: string, taskId: string) => ['task-total', userId, taskId] as const,
  projectTaskSeconds: (userId: string, projectId: string) => ['project-task-seconds', userId, projectId] as const,
  taskRanks: (userId: string, projectId: string) => ['task-ranks', userId, projectId] as const,
  log: (filters: SessionLogFilters) => ['session-log', filters] as const,
}

export function useProjectTaskSeconds(userId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.projectTaskSeconds(userId ?? '', projectId ?? ''),
    queryFn: () => getProjectTaskSeconds(userId!, projectId!),
    enabled: !!userId && !!projectId,
  })
}

export function useProjectTotals(userId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.projectTotals(userId ?? '', projectId ?? ''),
    queryFn: () => getProjectTotals(userId!, projectId!),
    enabled: !!userId && !!projectId,
  })
}

export function useTaskTotal(userId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.taskTotal(userId ?? '', taskId ?? ''),
    queryFn: () => getTaskTotal(userId!, taskId!),
    enabled: !!userId && !!taskId,
  })
}

export function useRunningSession(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.running(userId ?? ''),
    queryFn: () => getRunningSession(userId!),
    enabled: !!userId,
    refetchInterval: 30_000, // resync periodically; the UI ticks locally between fetches
  })
}

export function useTimeTotals(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.totals(userId ?? ''),
    queryFn: () => getTotals(userId!),
    enabled: !!userId,
  })
}

export function useSprintTotal(userId: string | undefined, sprintId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.sprintTotal(userId ?? '', sprintId ?? ''),
    queryFn: () => getSprintTotal(userId!, sprintId!),
    enabled: !!userId && !!sprintId,
  })
}

export function useSessionLog(filters: SessionLogFilters) {
  return useQuery({
    queryKey: timeKeys.log(filters),
    queryFn: () => listSessions(filters),
  })
}

export function useTaskRanks(userId: string | undefined, projectId: string | undefined, taskIds: string[]) {
  return useQuery({
    queryKey: [...timeKeys.taskRanks(userId ?? '', projectId ?? ''), taskIds.length],
    queryFn: () => getTaskRanks(userId!, taskIds),
    enabled: !!userId && !!projectId && taskIds.length > 0,
  })
}

export function useSetTaskRank(userId: string | undefined, projectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, rank }: { taskId: string; rank: number }) =>
      setTaskRank(userId!, taskId, rank),
    onSuccess: () => {
      if (userId && projectId) qc.invalidateQueries({ queryKey: timeKeys.taskRanks(userId, projectId) })
    },
  })
}

function useInvalidateTime(userId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    if (!userId) return
    qc.invalidateQueries({ queryKey: timeKeys.running(userId) })
    qc.invalidateQueries({ queryKey: timeKeys.totals(userId) })
    qc.invalidateQueries({ queryKey: ['task-total'] })
    qc.invalidateQueries({ queryKey: ['project-totals'] })
    qc.invalidateQueries({ queryKey: ['project-task-seconds'] })
    qc.invalidateQueries({ queryKey: ['session-log'] })
    qc.invalidateQueries({ queryKey: ['sprint-total'] })
  }
}

export function useStartTimer(userId: string | undefined) {
  const invalidate = useInvalidateTime(userId)
  return useMutation({
    mutationFn: (taskId: string) => startTimer(taskId),
    onSuccess: invalidate,
  })
}

export function useStopTimer(userId: string | undefined) {
  const invalidate = useInvalidateTime(userId)
  return useMutation({
    mutationFn: () => stopTimer(),
    onSuccess: invalidate,
  })
}

/** Local 1-second ticker so a running stopwatch updates smoothly between refetches. */
export function useTicker(active: boolean): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  return Date.now()
}
