import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchColumns,
  createColumn,
  updateColumn,
  reorderColumns,
  deleteColumn,
} from '@/services/columns'
import { projectKeys } from './useProjects'
import type { CreateColumnInput, UpdateColumnInput } from '@/types/database'

export const columnKeys = {
  all: (projectId: string) => ['columns', projectId] as const,
}

export function useColumns(projectId: string | undefined) {
  return useQuery({
    queryKey: columnKeys.all(projectId ?? ''),
    queryFn: () => fetchColumns(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateColumn(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateColumnInput) => createColumn(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: columnKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
    },
  })
}

export function useUpdateColumn(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      columnId,
      input,
    }: {
      columnId: string
      input: UpdateColumnInput
    }) => updateColumn(columnId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: columnKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
    },
  })
}

export function useReorderColumns(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (columnIds: string[]) => reorderColumns(projectId, columnIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: columnKeys.all(projectId) })
    },
  })
}

export function useDeleteColumn(projectId: string, projectSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (columnId: string) => deleteColumn(columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: columnKeys.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectSlug),
      })
    },
  })
}
