import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { updateProfile, uploadAvatar, removeAvatar } from '@/services/profiles'
import { toast } from 'sonner'

export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: (updates: { full_name: string }) => {
      if (!user) throw new Error('Not authenticated')
      return updateProfile(user.id, updates)
    },
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Profile updated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to update profile: ${err.message}`)
    },
  })
}

export function useUploadAvatar() {
  const { user, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: (file: File) => {
      if (!user) throw new Error('Not authenticated')
      return uploadAvatar(user.id, file)
    },
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Avatar updated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to upload avatar: ${err.message}`)
    },
  })
}

export function useRemoveAvatar() {
  const { user, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not authenticated')
      return removeAvatar(user.id)
    },
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Avatar removed')
    },
    onError: (err: Error) => {
      toast.error(`Failed to remove avatar: ${err.message}`)
    },
  })
}
