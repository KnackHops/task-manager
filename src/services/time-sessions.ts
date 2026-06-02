import { supabase } from '@/lib/supabase'
import type {
  TimeSession,
  TimeSessionWithTask,
  MyWorkTask,
  SessionLogFilters,
} from '@/types/database'
import { elapsedSeconds } from '@/lib/time-format'

/** Start (or switch to) the timer on a task. Closes any open session first (RPC). */
export async function startTimer(taskId: string): Promise<TimeSession> {
  const { data, error } = await supabase.rpc('start_task_timer', { p_task_id: taskId })
  if (error) throw error
  return data as TimeSession
}

/** Stop the running timer. Returns the closed session, or null if none was running. */
export async function stopTimer(): Promise<TimeSession | null> {
  const { data, error } = await supabase.rpc('stop_task_timer')
  if (error) throw error
  return (data as TimeSession) ?? null
}

/** The caller's currently running session (ended_at is null), joined to its task. */
export async function getRunningSession(
  userId: string,
): Promise<TimeSessionWithTask | null> {
  const { data, error } = await supabase
    .from('task_time_sessions')
    .select(
      `id, task_id, user_id, started_at, ended_at, created_at,
       user:profiles!user_id(id, full_name, avatar_url),
       task:tasks!task_id(id, title, task_number,
         project:projects!project_id(id, name, slug, prefix))`,
    )
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as TimeSessionWithTask
  return { ...row, duration_seconds: elapsedSeconds(row.started_at, row.ended_at) }
}

/** Tasks assigned to the user across all projects, with cumulative time + private rank. */
export async function fetchMyTasks(userId: string): Promise<MyWorkTask[]> {
  // Assigned, non-archived tasks across all projects.
  const { data: assigned, error: aErr } = await supabase
    .from('task_assignees')
    .select(
      `task:tasks!task_id(id, title, task_number, priority, is_done, sprint_id, archived,
        project:projects!project_id(id, name, slug, prefix))`,
    )
    .eq('assignee_id', userId)
  if (aErr) throw aErr

  const tasks = (assigned ?? [])
    .map((r) => (r as Record<string, unknown>).task as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && !t.archived)

  const taskIds = tasks.map((t) => t.id as string)
  if (taskIds.length === 0) return []

  // Per-task total seconds (sum of all the user's sessions on those tasks).
  const { data: sessions, error: sErr } = await supabase
    .from('task_time_sessions')
    .select('task_id, started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (sErr) throw sErr

  const totals = new Map<string, number>()
  for (const s of sessions ?? []) {
    const row = s as { task_id: string; started_at: string; ended_at: string | null }
    totals.set(row.task_id, (totals.get(row.task_id) ?? 0) + elapsedSeconds(row.started_at, row.ended_at))
  }

  // Private ranks.
  const { data: ranks, error: rErr } = await supabase
    .from('user_task_order')
    .select('task_id, rank')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (rErr) throw rErr
  const rankMap = new Map<string, number>()
  for (const r of ranks ?? []) rankMap.set((r as { task_id: string }).task_id, (r as { rank: number }).rank)

  const result: MyWorkTask[] = tasks.map((t) => ({
    id: t.id as string,
    title: t.title as string,
    task_number: t.task_number as number,
    priority: t.priority as MyWorkTask['priority'],
    is_done: t.is_done as boolean,
    sprint_id: (t.sprint_id as string | null) ?? null,
    project: t.project as MyWorkTask['project'],
    total_seconds: totals.get(t.id as string) ?? 0,
    rank: rankMap.get(t.id as string) ?? null,
  }))

  // Ranked first (ascending rank), then unranked by task_number.
  result.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    return a.task_number - b.task_number
  })
  return result
}

/** Sum of the user's session seconds within [from, to) (ISO timestamps). */
async function sumUserSeconds(userId: string, fromIso: string, toIso?: string): Promise<number> {
  let q = supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .gte('started_at', fromIso)
  if (toIso) q = q.lt('started_at', toIso)
  const { data, error } = await q
  if (error) throw error
  let total = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    total += elapsedSeconds(row.started_at, row.ended_at)
  }
  return total
}

export interface TimeTotals {
  todaySeconds: number
  monthSeconds: number
}

/** Today + this-month totals for the user (local-day / local-month boundaries). */
export async function getTotals(userId: string): Promise<TimeTotals> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const [todaySeconds, monthSeconds] = await Promise.all([
    sumUserSeconds(userId, startOfDay.toISOString()),
    sumUserSeconds(userId, startOfMonth.toISOString()),
  ])
  return { todaySeconds, monthSeconds }
}

/** Total seconds the user logged on tasks belonging to a given sprint. */
export async function getSprintTotal(userId: string, sprintId: string): Promise<number> {
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('sprint_id', sprintId)
  if (tErr) throw tErr
  const ids = (tasks ?? []).map((t) => (t as { id: string }).id)
  if (ids.length === 0) return 0
  const { data, error } = await supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', ids)
  if (error) throw error
  let total = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    total += elapsedSeconds(row.started_at, row.ended_at)
  }
  return total
}

/** Chronological session log. Project-scoped (team feed) or user-scoped (own log). */
export async function listSessions(filters: SessionLogFilters): Promise<TimeSessionWithTask[]> {
  let q = supabase
    .from('task_time_sessions')
    .select(
      `id, task_id, user_id, started_at, ended_at, created_at,
       user:profiles!user_id(id, full_name, avatar_url),
       task:tasks!task_id(id, title, task_number,
         project:projects!project_id(id, name, slug, prefix))`,
    )
    .order('started_at', { ascending: false })
    .limit(200)

  if (filters.userId) q = q.eq('user_id', filters.userId)
  if (filters.from) q = q.gte('started_at', filters.from)
  if (filters.to) q = q.lte('started_at', filters.to)

  const { data, error } = await q
  if (error) throw error
  let rows = (data ?? []).map((r) => {
    const row = r as unknown as TimeSessionWithTask
    return { ...row, duration_seconds: elapsedSeconds(row.started_at, row.ended_at) }
  })
  // Project filter: applied client-side via the joined task.project (RLS already limits
  // visibility to the caller's projects).
  if (filters.projectId) rows = rows.filter((r) => r.task?.project.id === filters.projectId)
  return rows
}
