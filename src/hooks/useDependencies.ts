import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setTaskDependencies } from '@/services/dependencies'
import { taskKeys } from './useTasks'
import type { TaskWithRelations, TaskDependency } from '@/types/database'

export function useSetTaskDependencies(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      dependsOnIds,
    }: {
      taskId: string
      dependsOnIds: string[]
      dependencies?: TaskDependency[]
    }) => setTaskDependencies(taskId, dependsOnIds),

    onMutate: async ({ taskId, dependsOnIds, dependencies }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const newDeps: TaskDependency[] =
        dependencies ??
        dependsOnIds
          .map((id) => {
            for (const [, tasks] of queryClient.getQueriesData<TaskWithRelations[]>({
              queryKey: taskKeys.all(projectId),
            })) {
              const t = tasks?.find((task) => task.id === id)
              if (t)
                return {
                  id: t.id,
                  task_number: t.task_number,
                  title: t.title,
                  is_done: t.is_done,
                }
            }
            return null
          })
          .filter(Boolean) as TaskDependency[]

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })
      const previousDetail = queryClient.getQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
      )

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) =>
          old?.map((t) => (t.id === taskId ? { ...t, dependencies: newDeps } : t)),
      )
      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => (old ? { ...old, dependencies: newDeps } : old),
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
          context.previousDetail,
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
