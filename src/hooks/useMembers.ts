import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchMembers,
  inviteMember,
  updateMemberPermissions,
  removeMember,
  toggleFavorite,
  acceptInvite,
  declineInvite,
  leaveProject,
  transferOwnership,
} from '@/services/members'
import { projectKeys } from './useProjects'
import { inviteKeys } from './useInvites'
import { notificationKeys } from './useNotifications'
import { useAuth } from '@/contexts/AuthContext'
import type { MemberPermissions, MemberStatus } from '@/types/database'

export const memberKeys = {
  all: (projectId: string) => ['members', projectId] as const,
}

export function useMembers(
  projectId: string | undefined,
  statusFilter: MemberStatus[] = ['active']
) {
  return useQuery({
    queryKey: [...memberKeys.all(projectId ?? ''), statusFilter],
    queryFn: () => fetchMembers(projectId!, statusFilter),
    enabled: !!projectId,
  })
}

export function useInviteMember(projectId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({
      email,
      permissions,
    }: {
      email: string
      permissions?: MemberPermissions
    }) => inviteMember(projectId, email, user!.id, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
    },
  })
}

export function useAcceptInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => acceptInvite(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inviteKeys.all })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

export function useDeclineInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => declineInvite(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inviteKeys.all })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
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
  const { user } = useAuth()
  return useMutation({
    mutationFn: (memberId: string) => removeMember(memberId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useLeaveProject(projectId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: () => leaveProject(projectId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useTransferOwnership(projectId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (newOwnerId: string) =>
      transferOwnership(projectId, user!.id, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
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
