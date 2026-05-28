import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'

export const apiKeyKeys = {
  all: ['api-keys'] as const,
}

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.all,
    queryFn: listApiKeys,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}
