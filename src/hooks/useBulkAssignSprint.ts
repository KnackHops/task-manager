import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bulkAssignTasksToSprint } from '@/services/sprints'
import { taskKeys } from './useTasks'
import { sprintKeys } from './useSprints'

export function useBulkAssignSprint(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskIds, sprintId }: { taskIds: string[]; sprintId: string }) =>
      bulkAssignTasksToSprint(taskIds, sprintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: sprintKeys.all(projectId) })
    },
  })
}
