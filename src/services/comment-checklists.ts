import { supabase } from '@/lib/supabase'
import type { CommentChecklistItem } from '@/types/database'

export async function fetchCommentChecklist(
  commentId: string,
): Promise<CommentChecklistItem[]> {
  const { data, error } = await supabase
    .from('comment_checklist_items')
    .select('*')
    .eq('comment_id', commentId)
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as CommentChecklistItem[]
}

export async function createCommentChecklistItem(
  commentId: string,
  title: string,
  position: number,
): Promise<CommentChecklistItem> {
  const { data, error } = await supabase
    .from('comment_checklist_items')
    .insert({ comment_id: commentId, title, position })
    .select()
    .single()

  if (error) throw error
  return data as CommentChecklistItem
}

export async function updateCommentChecklistItem(
  id: string,
  updates: { title?: string; is_done?: boolean; position?: number },
): Promise<CommentChecklistItem> {
  const { data, error } = await supabase
    .from('comment_checklist_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as CommentChecklistItem
}

export async function deleteCommentChecklistItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('comment_checklist_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function reorderCommentChecklistItems(
  commentId: string,
  orderedIds: string[],
): Promise<void> {
  const updates = orderedIds.map((id, i) =>
    supabase
      .from('comment_checklist_items')
      .update({ position: i })
      .eq('id', id)
      .eq('comment_id', commentId)
      .then()
  )
  await Promise.all(updates)
}
