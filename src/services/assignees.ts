import { supabase } from '@/lib/supabase'

export async function setTaskAssignees(
  taskId: string,
  assigneeIds: string[]
): Promise<void> {
  // Delete existing assignees
  await supabase.from('task_assignees').delete().eq('task_id', taskId)

  // Insert new assignees
  if (assigneeIds.length > 0) {
    const rows = assigneeIds.map((assigneeId) => ({
      task_id: taskId,
      assignee_id: assigneeId,
    }))
    const { error } = await supabase.from('task_assignees').insert(rows)
    if (error) throw error
  }
}
