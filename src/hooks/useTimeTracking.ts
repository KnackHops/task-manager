import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  startTimer,
  stopTimer,
  getRunningSession,
  fetchMyTasks,
  getTotals,
  getSprintTotal,
  listSessions,
} from '@/services/time-sessions'
import { setTaskRank } from '@/services/user-task-order'
import type { SessionLogFilters } from '@/types/database'

export const timeKeys = {
  myTasks: (userId: string) => ['my-tasks', userId] as const,
  running: (userId: string) => ['running-session', userId] as const,
  totals: (userId: string) => ['time-totals', userId] as const,
  sprintTotal: (userId: string, sprintId: string) => ['sprint-total', userId, sprintId] as const,
  log: (filters: SessionLogFilters) => ['session-log', filters] as const,
}

export function useMyTasks(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.myTasks(userId ?? ''),
    queryFn: () => fetchMyTasks(userId!),
    enabled: !!userId,
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

function useInvalidateTime(userId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    if (!userId) return
    qc.invalidateQueries({ queryKey: timeKeys.running(userId) })
    qc.invalidateQueries({ queryKey: timeKeys.totals(userId) })
    qc.invalidateQueries({ queryKey: timeKeys.myTasks(userId) })
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

export function useSetTaskRank(userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, rank }: { taskId: string; rank: number }) =>
      setTaskRank(userId!, taskId, rank),
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: timeKeys.myTasks(userId) })
    },
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
