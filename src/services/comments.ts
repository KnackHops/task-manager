import { supabase } from '@/lib/supabase'
import type { CommentWithAuthor } from '@/types/database'

const COMMENT_SELECT = `
  *,
  author:profiles!author_id(id, full_name, email, avatar_url),
  reactions:comment_reactions(emoji, user_id)
`

const COMMENT_PAGE_SIZE = 30

export async function fetchComments(
  taskId: string,
  cursor?: string
): Promise<{ data: CommentWithAuthor[]; hasMore: boolean; totalCount?: number }> {
  let query = supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(COMMENT_PAGE_SIZE + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as CommentWithAuthor[]
  const hasMore = rows.length > COMMENT_PAGE_SIZE
  if (hasMore) rows.pop()

  // Reverse so oldest is first within each page
  rows.reverse()

  // Total count on first page only
  let totalCount: number | undefined
  if (!cursor) {
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
    totalCount = count ?? undefined
  }

  return { data: rows, hasMore, totalCount }
}

export async function createComment(
  taskId: string,
  authorId: string,
  body: string
): Promise<CommentWithAuthor> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ task_id: taskId, author_id: authorId, body })
    .select(COMMENT_SELECT)
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
    .select(COMMENT_SELECT)
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

/** Toggle a user's emoji reaction on a comment (add if absent, remove if present). */
export async function toggleReaction(
  commentId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('comment_reactions')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()

  if (selErr) throw selErr

  if (existing) {
    const { error } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('comment_reactions')
      .insert({ comment_id: commentId, user_id: userId, emoji })
    if (error) throw error
  }
}
