import { supabase } from '@/lib/supabase'
import type { ChecklistItem } from '@/types/database'

export async function createChecklistItem(
  taskId: string,
  title: string,
  position: number,
): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({ task_id: taskId, title, position })
    .select()
    .single()

  if (error) throw error
  return data as ChecklistItem
}

export async function updateChecklistItem(
  id: string,
  updates: { title?: string; is_done?: boolean; position?: number },
): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ChecklistItem
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('task_checklist_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function reorderChecklistItems(
  taskId: string,
  orderedIds: string[],
): Promise<void> {
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('task_checklist_items')
      .update({ position: i })
      .eq('id', id)
      .eq('task_id', taskId)
      .then()
  )
  await Promise.all(updates)
}
