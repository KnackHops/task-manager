import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/services/notifications'
import { supabase } from '@/lib/supabase'

export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => fetchNotifications(userId!),
    enabled: !!userId,
  })
}

export function useUnreadCount(userId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => fetchUnreadCount(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  })
}

/** Global Realtime subscription — call from NotificationBell (always mounted) */
export function useNotificationRealtime(userId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: notificationKeys.all })
          queryClient.invalidateQueries({
            queryKey: notificationKeys.unreadCount,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount,
      })
    },
  })
}

export function useMarkAllAsRead(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => markAllAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount,
      })
    },
  })
}
