import { supabase } from '@/lib/supabase'
import type { NotificationWithActor } from '@/types/database'

const NOTIFICATION_PAGE_SIZE = 20

export async function fetchNotifications(
  userId: string,
  cursor?: string
): Promise<{ data: NotificationWithActor[]; hasMore: boolean }> {
  let query = supabase
    .from('notifications')
    .select(
      `
      *,
      actor:profiles!actor_id(id, full_name, avatar_url)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as NotificationWithActor[]
  const hasMore = rows.length > NOTIFICATION_PAGE_SIZE
  if (hasMore) rows.pop()

  return { data: rows, hasMore }
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count ?? 0
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) throw error
}

export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
}
