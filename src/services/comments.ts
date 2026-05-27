import { supabase } from '@/lib/supabase'
import type { CommentWithAuthor } from '@/types/database'

export async function fetchComments(
  taskId: string
): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      `
      *,
      author:profiles!author_id(id, full_name, email, avatar_url)
    `
    )
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as CommentWithAuthor[]
}

export async function createComment(
  taskId: string,
  authorId: string,
  body: string
): Promise<CommentWithAuthor> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ task_id: taskId, author_id: authorId, body })
    .select(
      `
      *,
      author:profiles!author_id(id, full_name, email, avatar_url)
    `
    )
    .single()

  if (error) throw error
  return data as CommentWithAuthor
}

export async function updateComment(
  commentId: string,
  body: string
): Promise<CommentWithAuthor> {
  const { data, error } = await supabase
    .from('comments')
    .update({ body })
    .eq('id', commentId)
    .select(
      `
      *,
      author:profiles!author_id(id, full_name, email, avatar_url)
    `
    )
    .single()

  if (error) throw error
  return data as CommentWithAuthor
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)

  if (error) throw error
}
