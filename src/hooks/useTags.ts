import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  setTaskTags,
} from '@/services/tags'
import { projectKeys } from './useProjects'
import { taskKeys } from './useTasks'
import type { CreateTagInput, UpdateTagInput, ProjectTag, TaskWithRelations } from '@/types/database'

export const tagKeys = {
  all: (projectId: string) => ['tags', projectId] as const,
}

export function useTags(projectId: string | undefined) {
  return useQuery({
    queryKey: tagKeys.all(projectId ?? ''),
    queryFn: () => fetchTags(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateTag(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTagInput) => createTag(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
    },
  })
}

export function useUpdateTag(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      tagId,
      input,
    }: {
      tagId: string
      input: UpdateTagInput
    }) => updateTag(tagId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
      // Tasks embed tag data — refetch so board/cards show updated names/colors
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useDeleteTag(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => deleteTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
      // Tasks embed tag data — refetch so deleted tags disappear from cards
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useSetTaskTags(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      tagIds,
    }: {
      taskId: string
      tagIds: string[]
      tags?: Pick<ProjectTag, 'id' | 'name' | 'slug' | 'color'>[]
    }) => setTaskTags(taskId, tagIds),

    onMutate: async ({ taskId, tagIds, tags }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(projectId) })
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      // Use pre-resolved tags if provided, fall back to cache lookup
      const newTags: Pick<ProjectTag, 'id' | 'name' | 'slug' | 'color'>[] =
        tags ??
        tagIds
          .map((id) => {
            const allTags =
              queryClient.getQueryData<ProjectTag[]>(tagKeys.all(projectId)) ?? []
            return allTags.find((t) => t.id === id)
          })
          .filter(Boolean) as Pick<ProjectTag, 'id' | 'name' | 'slug' | 'color'>[]

      const previousTasks = queryClient.getQueriesData<TaskWithRelations[]>({
        queryKey: taskKeys.all(projectId),
      })
      const previousDetail = queryClient.getQueryData<TaskWithRelations>(
        taskKeys.detail(taskId)
      )

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: taskKeys.all(projectId) },
        (old) => old?.map((t) => (t.id === taskId ? { ...t, tags: newTags } : t))
      )
      queryClient.setQueryData<TaskWithRelations>(
        taskKeys.detail(taskId),
        (old) => (old ? { ...old, tags: newTags } : old)
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
