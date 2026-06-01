import { supabase } from '@/lib/supabase'

export async function setTaskDependencies(
  taskId: string,
  dependsOnIds: string[],
): Promise<void> {
  await supabase.from('task_dependencies').delete().eq('task_id', taskId)

  if (dependsOnIds.length > 0) {
    const rows = dependsOnIds.map((depId) => ({
      task_id: taskId,
      depends_on_id: depId,
    }))
    const { error } = await supabase.from('task_dependencies').insert(rows)
    if (error) throw error
  }
}
