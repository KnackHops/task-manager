import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchMembers,
  inviteMember,
  updateMemberPermissions,
  removeMember,
  toggleFavorite,
} from '@/services/members'
import { projectKeys } from './useProjects'
import { useAuth } from '@/contexts/AuthContext'
import type { MemberPermissions } from '@/types/database'

export const memberKeys = {
  all: (projectId: string) => ['members', projectId] as const,
}

export function useMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.all(projectId ?? ''),
    queryFn: () => fetchMembers(projectId!),
    enabled: !!projectId,
  })
}

export function useInviteMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      email,
      permissions,
    }: {
      email: string
      permissions?: MemberPermissions
    }) => inviteMember(projectId, email, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
    },
  })
}

export function useUpdatePermissions(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      memberId,
      permissions,
    }: {
      memberId: string
      permissions: MemberPermissions
    }) => updateMemberPermissions(memberId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
    },
  })
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
    },
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({
      projectId,
      isFavorite,
    }: {
      projectId: string
      isFavorite: boolean
    }) => toggleFavorite(projectId, user!.id, isFavorite),
    onMutate: async ({ projectId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all })

      const previousProjects = queryClient.getQueryData(projectKeys.all)

      // Optimistically update project list
      queryClient.setQueryData(projectKeys.all, (old: any[] | undefined) =>
        old?.map((p: any) =>
          p.id === projectId
            ? { ...p, membership: { ...p.membership, is_favorite: isFavorite } }
            : p
        )
      )

      // Optimistically update project detail (board page)
      queryClient.setQueriesData(
        { queryKey: ['project'], type: 'active' },
        (old: any) => {
          if (old?.id === projectId) {
            return { ...old, membership: { ...old.membership, is_favorite: isFavorite } }
          }
          return old
        }
      )

      return { previousProjects }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(projectKeys.all, context.previousProjects)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
