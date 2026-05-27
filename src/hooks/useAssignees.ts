import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setTaskAssignees } from '@/services/assignees'
import { taskKeys } from './useTasks'
import { memberKeys } from './useMembers'
import type { TaskWithRelations, ProjectMemberWithProfile, Profile } from '@/types/database'

export function useSetTaskAssignees(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      assigneeIds,
    }: {
      taskId: string
      assigneeIds: string[]
      assignees?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
    }) => setTaskAssignees(taskId, assigneeIds),

    onMutate: async ({ taskId, assigneeIds, assignees }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      // Use pre-resolved assignees if provided, fall back to cache lookup
      const newAssignees: TaskWithRelations['assignees'] =
        assignees ??
        assigneeIds
          .map((id) => {
            const members =
              queryClient.getQueryData<ProjectMemberWithProfile[]>(
                memberKeys.all(projectId)
              ) ?? []
            const m = members.find((mem) => mem.user_id === id)
            if (!m) return null
            return {
              id: m.profile.id,
              full_name: m.profile.full_name,
              avatar_url: m.profile.avatar_url,
            }
          })
          .filter(Boolean) as TaskWithRelations['assignees']

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })
      const previousDetail = queryClient.getQueryData<TaskWithRelations>(
        taskKeys.detail(taskId)
      )

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) =>
          old?.map((t) =>
            t.id === taskId ? { ...t, assignees: newAssignees } : t
          )
      )
      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => (old ? { ...old, assignees: newAssignees } : old)
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
