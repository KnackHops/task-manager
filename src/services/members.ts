import { supabase } from '@/lib/supabase'
import type {
  ProjectMemberWithProfile,
  MemberPermissions,
} from '@/types/database'

export async function fetchMembers(
  projectId: string
): Promise<ProjectMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select(
      `
      *,
      profile:profiles!user_id(id, full_name, email, avatar_url)
    `
    )
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectMemberWithProfile[]
}

export async function inviteMember(
  projectId: string,
  email: string,
  permissions: MemberPermissions = {}
): Promise<void> {
  // Find profile by email
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (profileError) throw new Error(`No user found with email: ${email}`)

  const { error } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: profile.id,
    role: 'member',
    can_create_task: permissions.can_create_task ?? true,
    can_edit_task: permissions.can_edit_task ?? false,
    can_delete_task: permissions.can_delete_task ?? false,
    can_archive_task: permissions.can_archive_task ?? false,
    can_manage_columns: permissions.can_manage_columns ?? false,
    can_manage_members: permissions.can_manage_members ?? false,
  })

  if (error) {
    if (error.code === '23505') {
      throw new Error('User is already a member of this project')
    }
    throw error
  }
}

export async function updateMemberPermissions(
  memberId: string,
  permissions: MemberPermissions
): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .update(permissions)
    .eq('id', memberId)

  if (error) throw error
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId)

  if (error) throw error
}

export async function toggleFavorite(
  projectId: string,
  userId: string,
  isFavorite: boolean
): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .update({ is_favorite: isFavorite })
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw error
}
