import { supabase } from '@/lib/supabase'
import type {
  TimeSession,
  TimeSessionWithTask,
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

export interface ProjectTimeTotals {
  todaySeconds: number
  weekSeconds: number
}

/** The user's today + this-week time on a single project (week starts Monday, local). */
export async function getProjectTotals(
  userId: string,
  projectId: string,
): Promise<ProjectTimeTotals> {
  const { data: ptasks, error: ptErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
  if (ptErr) throw ptErr
  const ids = (ptasks ?? []).map((t) => (t as { id: string }).id)
  if (ids.length === 0) return { todaySeconds: 0, weekSeconds: 0 }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysSinceMonday = (now.getDay() + 6) % 7 // 0 = Monday
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)

  const { data, error } = await supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', ids)
    .gte('started_at', startOfWeek.toISOString())
  if (error) throw error

  const dayMs = startOfDay.getTime()
  let todaySeconds = 0
  let weekSeconds = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    const secs = elapsedSeconds(row.started_at, row.ended_at)
    weekSeconds += secs
    if (new Date(row.started_at).getTime() >= dayMs) todaySeconds += secs
  }
  return { todaySeconds, weekSeconds }
}

/** Map of taskId → seconds the user has logged, across all tasks in a project. */
export async function getProjectTaskSeconds(
  userId: string,
  projectId: string,
): Promise<Record<string, number>> {
  const { data: ptasks, error: ptErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
  if (ptErr) throw ptErr
  const ids = (ptasks ?? []).map((t) => (t as { id: string }).id)
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('task_time_sessions')
    .select('task_id, started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', ids)
  if (error) throw error

  const map: Record<string, number> = {}
  for (const s of data ?? []) {
    const row = s as { task_id: string; started_at: string; ended_at: string | null }
    // Closed sessions only. The open (running) session is added live in the UI
    // from the running-session query, so excluding it here avoids double-counting.
    if (row.ended_at == null) continue
    map[row.task_id] = (map[row.task_id] ?? 0) + elapsedSeconds(row.started_at, row.ended_at)
  }
  return map
}

/** Total seconds the user has logged on a single task (all their sessions on it). */
export async function getTaskTotal(userId: string, taskId: string): Promise<number> {
  const { data, error } = await supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .eq('task_id', taskId)
  if (error) throw error
  let total = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    total += elapsedSeconds(row.started_at, row.ended_at)
  }
  return total
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
  let projectTaskIds: string[] | undefined
  if (filters.projectId) {
    const { data: projTasks, error: ptErr } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', filters.projectId)
    if (ptErr) throw ptErr
    projectTaskIds = (projTasks ?? []).map((t) => (t as { id: string }).id)
    if (projectTaskIds.length === 0) return []
  }

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
  if (projectTaskIds) q = q.in('task_id', projectTaskIds)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as unknown as TimeSessionWithTask
    return { ...row, duration_seconds: elapsedSeconds(row.started_at, row.ended_at) }
  })
}
