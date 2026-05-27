import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  uploadAttachment,
  fetchTaskAttachments,
  fetchCommentAttachments,
  deleteAttachment,
  reorderAttachments,
} from '@/services/attachments'
import type { AttachmentWithUploader } from '@/types/database'

export const attachmentKeys = {
  task: (taskId: string) => ['attachments', 'task', taskId] as const,
  comment: (commentId: string) => ['attachments', 'comment', commentId] as const,
}

export function useTaskAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: attachmentKeys.task(taskId ?? ''),
    queryFn: () => fetchTaskAttachments(taskId!),
    enabled: !!taskId,
  })
}

export function useCommentAttachments(commentId: string | undefined) {
  return useQuery({
    queryKey: attachmentKeys.comment(commentId ?? ''),
    queryFn: () => fetchCommentAttachments(commentId!),
    enabled: !!commentId,
  })
}

export function useUploadAttachment(taskId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      uploadedBy,
      target,
    }: {
      file: File
      uploadedBy: string
      target: { taskId: string } | { commentId: string }
    }) => uploadAttachment(file, uploadedBy, target),
    onSuccess: (_data, variables) => {
      const { target } = variables
      if ('taskId' in target) {
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.task(target.taskId),
        })
      } else {
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.comment(target.commentId),
        })
      }
      // Also invalidate task attachments if we know the task
      if (taskId) {
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.task(taskId),
        })
      }
    },
  })
}

export function useDeleteAttachment(taskId?: string, commentId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, storagePath }: { id: string; storagePath: string }) =>
      deleteAttachment(id, storagePath),
    onSuccess: () => {
      if (taskId) {
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.task(taskId),
        })
      }
      if (commentId) {
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.comment(commentId),
        })
      }
    },
  })
}

export function useReorderAttachments(taskId?: string, commentId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderAttachments(orderedIds),
    onMutate: async (orderedIds) => {
      const key = taskId
        ? attachmentKeys.task(taskId)
        : attachmentKeys.comment(commentId!)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AttachmentWithUploader[]>(key)
      if (previous) {
        const reordered = orderedIds
          .map((id) => previous.find((a) => a.id === id))
          .filter(Boolean) as AttachmentWithUploader[]
        queryClient.setQueryData(key, reordered)
      }
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => {
      if (taskId)
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.task(taskId),
        })
      if (commentId)
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.comment(commentId),
        })
    },
  })
}
