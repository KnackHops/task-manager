import { useState, useRef, useEffect } from 'react'
import { Camera, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUpdateProfile, useUploadAvatar, useRemoveAvatar } from '@/hooks/useProfiles'
import { Avatar } from '@/components/ui/Avatar'
import { format } from 'date-fns'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB

export function ProfileSettings() {
  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const removeAvatar = useRemoveAvatar()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name)
    }
  }, [profile?.full_name])

  const isDirty = fullName.trim() !== (profile?.full_name ?? '')

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return
    }

    uploadAvatar.mutate(file)
    e.target.value = ''
  }

  function handleSaveName() {
    const trimmed = fullName.trim()
    if (!trimmed || !isDirty) return
    updateProfile.mutate({ full_name: trimmed })
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Profile</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Your personal information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={profile.full_name} url={profile.avatar_url} size="lg" />
          {uploadAvatar.isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAvatar.isPending}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {profile.avatar_url ? 'Change' : 'Upload'}
          </button>
          {profile.avatar_url && (
            <button
              type="button"
              onClick={() => removeAvatar.mutate()}
              disabled={removeAvatar.isPending}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Display Name */}
      <div className="space-y-1.5">
        <label htmlFor="display-name" className="text-sm font-medium text-foreground">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/50"
            placeholder="Your name"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!isDirty || !fullName.trim() || updateProfile.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateProfile.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="space-y-2 rounded-md border border-border p-4">
        <h4 className="text-sm font-medium text-foreground">Account</h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="text-foreground">{profile.email}</span>
          <span className="text-muted-foreground">Member since</span>
          <span className="text-foreground">{format(new Date(profile.created_at), 'MMMM d, yyyy')}</span>
        </div>
      </div>
    </div>
  )
}
