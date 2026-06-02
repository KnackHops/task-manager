import { supabase } from '@/lib/supabase'

/** Upsert the caller's private rank for a task. Caller computes the rank (drag midpoint). */
export async function setTaskRank(userId: string, taskId: string, rank: number): Promise<void> {
  const { error } = await supabase
    .from('user_task_order')
    .upsert({ user_id: userId, task_id: taskId, rank }, { onConflict: 'user_id,task_id' })
  if (error) throw error
}

/** The caller's private ranks for a set of tasks, as a taskId → rank map. */
export async function getTaskRanks(
  userId: string,
  taskIds: string[],
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {}
  const { data, error } = await supabase
    .from('user_task_order')
    .select('task_id, rank')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (error) throw error
  const map: Record<string, number> = {}
  for (const r of data ?? []) {
    const row = r as { task_id: string; rank: number }
    map[row.task_id] = row.rank
  }
  return map
}

/**
 * Given the ordered list of task ranks AFTER a drag (the moved task already sits at
 * `toIndex`), return a fractional rank between its new neighbors. Falls back to the
 * index when a neighbor has no stored rank yet.
 */
export function midpointRank(ranks: (number | null)[], toIndex: number): number {
  const rankAt = (i: number): number | null =>
    i >= 0 && i < ranks.length ? (ranks[i] ?? null) : null
  const prev = rankAt(toIndex - 1) ?? toIndex - 1
  const next = rankAt(toIndex + 1)
  if (next == null) return prev + 1
  return (prev + next) / 2
}
