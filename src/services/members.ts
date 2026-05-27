import { supabase } from '@/lib/supabase'
import type {
  ProjectMemberWithProfile,
  PendingInvite,
  MemberPermissions,
  MemberStatus,
} from '@/types/database'

export async function fetchMembers(
  projectId: string,
  statusFilter: MemberStatus[] = ['active']
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
    .in('status', statusFilter)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectMemberWithProfile[]
}

export async function inviteMember(
  projectId: string,
  email: string,
  invitedBy: string,
  permissions: MemberPermissions = {}
): Promise<string> {
  // Find profile by email
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (profileError) throw new Error(`No user found with email: ${email}`)

  // Insert pending membership
  const { data: member, error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: profile.id,
      role: 'member',
      status: 'pending',
      invited_by: invitedBy,
      can_create_task: permissions.can_create_task ?? true,
      can_edit_task: permissions.can_edit_task ?? false,
      can_delete_task: permissions.can_delete_task ?? false,
      can_archive_task: permissions.can_archive_task ?? false,
      can_manage_columns: permissions.can_manage_columns ?? false,
      can_manage_members: permissions.can_manage_members ?? false,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('User is already a member of this project')
    }
    throw error
  }

  // Fetch project name + slug and inviter name for notification message
  const [{ data: project }, { data: inviter }] = await Promise.all([
    supabase
      .from('projects')
      .select('name, slug')
      .eq('id', projectId)
      .single(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', invitedBy)
      .single(),
  ])

  const projectName = project?.name ?? 'a project'
  const projectSlug = project?.slug ?? ''
  const inviterName = inviter?.full_name ?? 'Someone'

  // Insert invite notification
  await supabase.from('notifications').insert({
    user_id: profile.id,
    type: 'invite',
    task_id: null,
    actor_id: invitedBy,
    message: `${inviterName} invited you to "${projectName}"`,
    project_slug: projectSlug,
    project_member_id: member.id,
  })

  return member.id
}

export async function fetchPendingInvites(
  userId: string
): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select(
      `
      *,
      project:projects!project_id(id, name, slug),
      inviter:profiles!invited_by(id, full_name, avatar_url)
    `
    )
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('joined_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as PendingInvite[]
}

export async function acceptInvite(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .update({ status: 'active' })
    .eq('id', memberId)

  if (error) throw error
}

export async function declineInvite(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId)

  if (error) throw error
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
