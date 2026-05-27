import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyProjects,
  fetchProjectBySlug,
  createProject,
  updateProject,
  deleteProject,
} from '@/services/projects'
import { useAuth } from '@/contexts/AuthContext'
import type { UpdateProjectInput } from '@/types/database'

export const projectKeys = {
  all: ['projects'] as const,
  detail: (slug: string) => ['project', slug] as const,
}

export function useMyProjects() {
  const { user } = useAuth()
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => fetchMyProjects(user!.id),
    enabled: !!user,
  })
}

export function useProject(slug: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: projectKeys.detail(slug ?? ''),
    queryFn: () => fetchProjectBySlug(slug!, user!.id),
    enabled: !!slug && !!user,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      createProject(name, slug, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export function useUpdateProject(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string
      input: UpdateProjectInput
    }) => updateProject(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(slug) })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
