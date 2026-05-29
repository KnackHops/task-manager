import { supabase } from '@/lib/supabase'

const AVATAR_BUCKET = 'avatars'

export async function updateProfile(
  userId: string,
  updates: { full_name: string }
) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) throw error
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${userId}/${uniqueId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: false })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const avatarUrl = data.publicUrl

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)

  if (updateError) throw updateError

  return avatarUrl
}

export async function removeAvatar(userId: string): Promise<void> {
  // List all files in user's avatar folder and remove them
  const { data: files } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(userId)

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`)
    await supabase.storage.from(AVATAR_BUCKET).remove(paths)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId)

  if (error) throw error
}
