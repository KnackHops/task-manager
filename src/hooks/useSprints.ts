import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  completeSprint,
} from '@/services/sprints'
import { taskKeys } from './useTasks'
import type { CreateSprintInput, UpdateSprintInput } from '@/types/database'

export const sprintKeys = {
  all: (projectId: string) => ['sprints', projectId] as const,
}

export function useSprints(projectId: string | undefined) {
  return useQuery({
    queryKey: sprintKeys.all(projectId ?? ''),
    queryFn: () => fetchSprints(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateSprint(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSprintInput) => createSprint(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all(projectId) })
    },
  })
}

export function useUpdateSprint(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sprintId,
      input,
    }: {
      sprintId: string
      input: UpdateSprintInput
    }) => updateSprint(sprintId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useDeleteSprint(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sprintId: string) => deleteSprint(sprintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}

export function useCompleteSprint(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sprintId,
      moveToSprintId,
    }: {
      sprintId: string
      moveToSprintId?: string | null
    }) => completeSprint(sprintId, moveToSprintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
    },
  })
}
