import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItems,
} from '@/services/checklists'
import { taskKeys } from './useTasks'
import type { TaskWithRelations, ChecklistItem } from '@/types/database'

export function useCreateChecklistItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      title,
      position,
    }: {
      taskId: string
      title: string
      position: number
    }) => createChecklistItem(taskId, title, position),

    onMutate: async ({ taskId, title, position }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const tempId = crypto.randomUUID()
      const optimistic: ChecklistItem = {
        id: tempId,
        task_id: taskId,
        title,
        is_done: false,
        position,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const previousDetail = queryClient.getQueryData<TaskWithRelations>(taskKeys.detail(taskId))
      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({ queryKey: taskKeys.all(projectId) })

      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => old ? { ...old, checklist_items: [...(old.checklist_items ?? []), optimistic] } : old,
      )
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) =>
          t.id === taskId ? { ...t, checklist_items: [...(t.checklist_items ?? []), optimistic] } : t
        ),
      )

      return { previousDetail, previousTasks, taskId }
    },

    onError: (err, _vars, context) => {
      toast.error(`Failed to add checklist item: ${err instanceof Error ? err.message : String(err)}`)
      if (context?.previousDetail) {
        queryClient.setQueryData(taskKeys.detail(context.taskId), context.previousDetail)
      }
      if (context?.previousTasks) {
        for (const [key, data] of context.previousTasks) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useUpdateChecklistItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      taskId: string
      updates: { title?: string; is_done?: boolean; position?: number }
    }) => updateChecklistItem(id, updates),

    onMutate: async ({ id, taskId, updates }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const previousDetail = queryClient.getQueryData<TaskWithRelations>(taskKeys.detail(taskId))
      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({ queryKey: taskKeys.all(projectId) })

      const updateItems = (items?: ChecklistItem[]) =>
        items?.map((item) => item.id === id ? { ...item, ...updates } : item)

      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => old ? { ...old, checklist_items: updateItems(old.checklist_items) } : old,
      )
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) =>
          t.id === taskId ? { ...t, checklist_items: updateItems(t.checklist_items) } : t
        ),
      )

      return { previousDetail, previousTasks, taskId }
    },

    onError: (_err, _vars, context) => {
      toast.error('Failed to update checklist item')
      if (context?.previousDetail) {
        queryClient.setQueryData(taskKeys.detail(context.taskId), context.previousDetail)
      }
      if (context?.previousTasks) {
        for (const [key, data] of context.previousTasks) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useDeleteChecklistItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; taskId: string }) => deleteChecklistItem(id),

    onMutate: async ({ id, taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const previousDetail = queryClient.getQueryData<TaskWithRelations>(taskKeys.detail(taskId))
      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({ queryKey: taskKeys.all(projectId) })

      const removeItem = (items?: ChecklistItem[]) => items?.filter((item) => item.id !== id)

      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => old ? { ...old, checklist_items: removeItem(old.checklist_items) } : old,
      )
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) =>
          t.id === taskId ? { ...t, checklist_items: removeItem(t.checklist_items) } : t
        ),
      )

      return { previousDetail, previousTasks, taskId }
    },

    onError: (_err, _vars, context) => {
      toast.error('Failed to delete checklist item')
      if (context?.previousDetail) {
        queryClient.setQueryData(taskKeys.detail(context.taskId), context.previousDetail)
      }
      if (context?.previousTasks) {
        for (const [key, data] of context.previousTasks) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useReorderChecklistItems(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      orderedIds,
    }: {
      taskId: string
      orderedIds: string[]
    }) => reorderChecklistItems(taskId, orderedIds),

    onMutate: async ({ taskId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const previousDetail = queryClient.getQueryData<TaskWithRelations>(taskKeys.detail(taskId))
      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({ queryKey: taskKeys.all(projectId) })

      const reorder = (items?: ChecklistItem[]) => {
        if (!items) return items
        return orderedIds
          .map((id, i) => {
            const item = items.find((it) => it.id === id)
            return item ? { ...item, position: i } : null
          })
          .filter(Boolean) as ChecklistItem[]
      }

      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => old ? { ...old, checklist_items: reorder(old.checklist_items) } : old,
      )
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) =>
          t.id === taskId ? { ...t, checklist_items: reorder(t.checklist_items) } : t
        ),
      )

      return { previousDetail, previousTasks, taskId }
    },

    onError: (_err, _vars, context) => {
      toast.error('Failed to reorder checklist items')
      if (context?.previousDetail) {
        queryClient.setQueryData(taskKeys.detail(context.taskId), context.previousDetail)
      }
      if (context?.previousTasks) {
        for (const [key, data] of context.previousTasks) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}
