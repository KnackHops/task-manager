import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTasks,
  fetchTask,
  createTask,
  updateTask,
  archiveTask,
  unarchiveTask,
  reorderTask,
  deleteTask,
} from '@/services/tasks'
import type {
  TaskWithRelations,
  CreateTaskInput,
  UpdateTaskInput,
} from '@/types/database'

export const taskKeys = {
  all: (projectId: string) => ['tasks', projectId] as const,
  filtered: (
    projectId: string,
    filters?: { columnId?: string; archived?: boolean; tagSlug?: string; sprintId?: string | null }
  ) => ['tasks', projectId, filters] as const,
  detail: (taskId: string) => ['task', taskId] as const,
}

export function useTasks(
  projectId: string | undefined,
  filters?: {
    columnId?: string
    archived?: boolean
    tagSlug?: string
    sprintId?: string | null
  }
) {
  return useQuery({
    queryKey: taskKeys.filtered(projectId ?? '', filters),
    queryFn: () => fetchTasks(projectId!, filters),
    enabled: !!projectId,
  })
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    queryFn: () => fetchTask(taskId!),
    enabled: !!taskId,
  })
}

export function useCreateTask(projectId: string, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      createTask(projectId, userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string
      input: UpdateTaskInput
    }) => updateTask(taskId, input),

    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })
      const previousDetail = queryClient.getQueryData<TaskWithRelations>(
        taskKeys.detail(taskId)
      )

      // Patch task list cache
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) => (t.id === taskId ? { ...t, ...input } : t))
      )

      // Patch detail cache
      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => (old ? { ...old, ...input } : old)
      )

      return { previousTasks, previousDetail, taskId }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        for (const [queryKey, data] of context.previousTasks) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(
          taskKeys.detail(context.taskId),
          context.previousDetail
        )
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
    },
  })
}

export function useArchiveTask(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => archiveTask(taskId),

    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => {
          if (!old) return old
          return old.map((t) =>
            t.id === taskId
              ? { ...t, archived: true, archived_at: new Date().toISOString() }
              : t
          )
        }
      )

      return { previousTasks }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        for (const [queryKey, data] of context.previousTasks) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },

    onSettled: (_data, _err, taskId) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
    },
  })
}

export function useUnarchiveTask(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      columnId,
    }: {
      taskId: string
      columnId: string
    }) => unarchiveTask(taskId, columnId),

    onMutate: async ({ taskId, columnId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => {
          if (!old) return old
          return old.map((t) =>
            t.id === taskId
              ? { ...t, archived: false, archived_at: null, column_id: columnId }
              : t
          )
        }
      )

      return { previousTasks }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        for (const [queryKey, data] of context.previousTasks) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },

    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
    },
  })
}

// Optimistic update + error rollback handled synchronously in
// BoardContainer.handleDragEnd to avoid async microtask flash.
export function useReorderTask(projectId: string) {
  return useMutation({
    mutationFn: ({
      taskId,
      newColumnId,
      newPosition,
      sprintIdOverride,
    }: {
      taskId: string
      newColumnId: string
      newPosition: number
      sprintIdOverride?: string | null
    }) => reorderTask(taskId, newColumnId, newPosition, projectId, sprintIdOverride),
  })
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}
