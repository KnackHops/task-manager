import { useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
  toggleReaction,
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
      // Reactions have no task_id to filter on, so we listen to all and refetch
      // this task's comments. ponytail: unfiltered — a reaction on another task
      // triggers one extra refetch here; fine at current scale.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_reactions' },
        () => {
          queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId, queryClient])

  return useInfiniteQuery({
    queryKey: commentKeys.all(taskId ?? ''),
    queryFn: ({ pageParam }) => fetchComments(taskId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.data.length === 0) return undefined
      // Cursor = oldest comment's created_at in this page (first item, since reversed)
      return lastPage.data[0]!.created_at
    },
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

export function useToggleReaction(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      commentId,
      userId,
      emoji,
    }: {
      commentId: string
      userId: string
      emoji: string
    }) => toggleReaction(commentId, userId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.all(taskId) })
    },
  })
}
