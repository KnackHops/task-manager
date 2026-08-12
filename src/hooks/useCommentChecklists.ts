import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  fetchCommentChecklist,
  createCommentChecklistItem,
  updateCommentChecklistItem,
  deleteCommentChecklistItem,
  reorderCommentChecklistItems,
} from '@/services/comment-checklists'
import type { CommentChecklistItem } from '@/types/database'

export const commentChecklistKeys = {
  comment: (commentId: string) => ['comment-checklist', commentId] as const,
}

export function useCommentChecklist(commentId: string | undefined) {
  return useQuery({
    queryKey: commentChecklistKeys.comment(commentId ?? ''),
    queryFn: () => fetchCommentChecklist(commentId!),
    enabled: !!commentId,
  })
}

export function useCreateCommentChecklistItem(commentId: string) {
  const queryClient = useQueryClient()
  const key = commentChecklistKeys.comment(commentId)
  return useMutation({
    mutationFn: ({ title, position }: { title: string; position: number }) =>
      createCommentChecklistItem(commentId, title, position),

    onMutate: async ({ title, position }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentChecklistItem[]>(key)
      const optimistic: CommentChecklistItem = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        comment_id: commentId,
        title,
        is_done: false,
        position,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      queryClient.setQueryData<CommentChecklistItem[]>(key, (old) => [...(old ?? []), optimistic])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      toast.error('Failed to add checklist item')
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateCommentChecklistItem(commentId: string) {
  const queryClient = useQueryClient()
  const key = commentChecklistKeys.comment(commentId)
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: { title?: string; is_done?: boolean; position?: number }
    }) => updateCommentChecklistItem(id, updates),

    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentChecklistItem[]>(key)
      queryClient.setQueryData<CommentChecklistItem[]>(key, (old) =>
        old?.map((it) => (it.id === id ? { ...it, ...updates } : it)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      toast.error('Failed to update checklist item')
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteCommentChecklistItem(commentId: string) {
  const queryClient = useQueryClient()
  const key = commentChecklistKeys.comment(commentId)
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteCommentChecklistItem(id),

    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentChecklistItem[]>(key)
      queryClient.setQueryData<CommentChecklistItem[]>(key, (old) => old?.filter((it) => it.id !== id))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      toast.error('Failed to delete checklist item')
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useReorderCommentChecklistItems(commentId: string) {
  const queryClient = useQueryClient()
  const key = commentChecklistKeys.comment(commentId)
  return useMutation({
    mutationFn: ({ orderedIds }: { orderedIds: string[] }) =>
      reorderCommentChecklistItems(commentId, orderedIds),

    onMutate: async ({ orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentChecklistItem[]>(key)
      if (previous) {
        const reordered = orderedIds
          .map((id, i) => {
            const it = previous.find((x) => x.id === id)
            return it ? { ...it, position: i } : null
          })
          .filter(Boolean) as CommentChecklistItem[]
        queryClient.setQueryData(key, reordered)
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      toast.error('Failed to reorder checklist items')
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
