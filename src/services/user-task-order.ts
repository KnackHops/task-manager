import { supabase } from '@/lib/supabase'

/** Upsert the caller's private rank for a task. Caller computes the rank (drag midpoint). */
export async function setTaskRank(userId: string, taskId: string, rank: number): Promise<void> {
  const { error } = await supabase
    .from('user_task_order')
    .upsert({ user_id: userId, task_id: taskId, rank }, { onConflict: 'user_id,task_id' })
  if (error) throw error
}

/**
 * Given the ordered list of task ids after a drag and the index the task moved to,
 * return a fractional rank between its new neighbors. Ranks default to their index
 * when a neighbor has no stored rank yet.
 */
export function midpointRank(
  ranks: (number | null)[],
  toIndex: number,
): number {
  const rankAt = (i: number): number | null => (i >= 0 && i < ranks.length ? ranks[i] ?? null : null)
  const prev = rankAt(toIndex - 1) ?? (toIndex - 1)
  const next = rankAt(toIndex + 1)
  if (next == null) return prev + 1
  return (prev + next) / 2
}
