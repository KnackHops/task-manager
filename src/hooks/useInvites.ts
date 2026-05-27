import { useQuery } from '@tanstack/react-query'
import { fetchPendingInvites } from '@/services/members'

export const inviteKeys = {
  all: ['invites'] as const,
}

export function usePendingInvites(userId: string | undefined) {
  return useQuery({
    queryKey: inviteKeys.all,
    queryFn: () => fetchPendingInvites(userId!),
    enabled: !!userId,
  })
}

export function usePendingInviteCount(userId: string | undefined) {
  const { data } = usePendingInvites(userId)
  return data?.length ?? 0
}
