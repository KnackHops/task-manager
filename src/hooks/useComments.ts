import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
} from '@/services/comments'
import { supabase } from '@/lib/supabase'

export const commentKeys = {
  all: (taskId: string) => ['comments', taskId] as const,
}

export function useComments(taskId: string | undefined) {
  const queryClient = useQueryClient()

  // Realtime: auto-refetch on comment changes
  useEffect(() => {
    if (!taskId) return

    const channel = supabase
      .channel(`comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId, queryClient])

  return useQuery({
    queryKey: commentKeys.all(taskId ?? ''),
    queryFn: () => fetchComments(taskId!),
    enabled: !!taskId,
  })
}

export function useCreateComment(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ authorId, body }: { authorId: string; body: string }) =>
      createComment(taskId, authorId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
    },
  })
}

export function useUpdateComment(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateComment(commentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
    },
  })
}

export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
    },
  })
}
