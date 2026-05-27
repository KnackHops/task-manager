import { supabase } from '@/lib/supabase'
import { differenceInCalendarDays, parseISO, format, addDays } from 'date-fns'

// --------------- Types ---------------

export interface SprintSummary {
  totalTasks: number
  doneTasks: number
  totalPoints: number
  donePoints: number
  tasksByPriority: Record<string, { total: number; done: number }>
}

export interface BurndownPoint {
  date: string
  remainingTasks: number
  remainingPoints: number
  idealTasks: number
  idealPoints: number
}

export interface VelocityEntry {
  sprintId: string
  sprintName: string
  completedTasks: number
  completedPoints: number
}

// --------------- Sprint Summary ---------------

export async function fetchSprintSummary(
  sprintId: string,
  doneColumnIds: string[]
): Promise<SprintSummary> {
  // Fetch all tasks for this sprint (including archived)
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, column_id, priority, story_points, archived, is_done')
    .eq('sprint_id', sprintId)

  if (error) throw error

  const all = tasks ?? []
  const isDone = (t: (typeof all)[number]) =>
    doneColumnIds.includes(t.column_id) || t.archived || t.is_done
  const done = all.filter(isDone)

  const tasksByPriority: Record<string, { total: number; done: number }> = {}
  for (const t of all) {
    const p = t.priority ?? 'medium'
    if (!tasksByPriority[p]) tasksByPriority[p] = { total: 0, done: 0 }
    tasksByPriority[p]!.total++
    if (isDone(t)) {
      tasksByPriority[p]!.done++
    }
  }

  return {
    totalTasks: all.length,
    doneTasks: done.length,
    totalPoints: all.reduce((s, t) => s + (t.story_points ?? 0), 0),
    donePoints: done.reduce((s, t) => s + (t.story_points ?? 0), 0),
    tasksByPriority,
  }
}

// --------------- Burndown ---------------

export async function fetchSprintBurndown(
  sprintId: string,
  doneColumnIds: string[],
  startDate: string,
  endDate: string
): Promise<BurndownPoint[]> {
  // Fetch sprint tasks with timestamps
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, column_id, story_points, archived, archived_at, is_done, done_at, updated_at')
    .eq('sprint_id', sprintId)

  if (error) throw error

  const all = tasks ?? []
  const totalTasks = all.length
  const totalPoints = all.reduce((s, t) => s + (t.story_points ?? 0), 0)

  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const totalDays = differenceInCalendarDays(end, start)
  if (totalDays <= 0) return []

  const points: BurndownPoint[] = []

  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(start, d)
    const dateStr = format(date, 'yyyy-MM-dd')

    // Count tasks done by this date
    const doneByDate = all.filter((t) => {
      // Archived tasks — use archived_at
      if (t.archived && t.archived_at) {
        return format(parseISO(t.archived_at), 'yyyy-MM-dd') <= dateStr
      }
      // Task-level done — use done_at
      if (t.is_done && t.done_at) {
        return format(parseISO(t.done_at), 'yyyy-MM-dd') <= dateStr
      }
      // In done column — use updated_at as approximation
      if (doneColumnIds.includes(t.column_id) && !t.archived) {
        return format(parseISO(t.updated_at), 'yyyy-MM-dd') <= dateStr
      }
      return false
    })

    const doneTaskCount = doneByDate.length
    const donePointCount = doneByDate.reduce(
      (s, t) => s + (t.story_points ?? 0),
      0
    )

    points.push({
      date: format(date, 'MMM d'),
      remainingTasks: totalTasks - doneTaskCount,
      remainingPoints: totalPoints - donePointCount,
      idealTasks: Math.round((totalTasks * (totalDays - d)) / totalDays),
      idealPoints: Math.round((totalPoints * (totalDays - d)) / totalDays),
    })
  }

  return points
}

// --------------- Velocity ---------------

export async function fetchVelocity(
  projectId: string
): Promise<VelocityEntry[]> {
  // Fetch completed sprints
  const { data: sprints, error: sprintError } = await supabase
    .from('sprints')
    .select('id, name')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('start_date', { ascending: true })

  if (sprintError) throw sprintError
  if (!sprints || sprints.length === 0) return []

  // Fetch done column IDs
  const { data: doneCols } = await supabase
    .from('project_columns')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_done', true)

  const doneColumnIds = doneCols?.map((c) => c.id) ?? []

  const entries: VelocityEntry[] = []

  for (const sprint of sprints) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, column_id, story_points, archived, is_done')
      .eq('sprint_id', sprint.id)

    const all = tasks ?? []
    const done = all.filter(
      (t) => doneColumnIds.includes(t.column_id) || t.archived || t.is_done
    )

    entries.push({
      sprintId: sprint.id,
      sprintName: sprint.name,
      completedTasks: done.length,
      completedPoints: done.reduce((s, t) => s + (t.story_points ?? 0), 0),
    })
  }

  return entries
}
