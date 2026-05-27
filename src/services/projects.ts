import { supabase } from '@/lib/supabase'
import type {
  Project,
  ProjectListItem,
  ProjectWithDetails,
  ProjectColumn,
  ProjectTag,
  ProjectMember,
  UpdateProjectInput,
} from '@/types/database'

export async function fetchMyProjects(
  userId: string
): Promise<ProjectListItem[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select(
      `
      *,
      project:projects!project_id(*)
    `
    )
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  if (error) throw error

  // Shape into ProjectListItem
  const items: ProjectListItem[] = []
  for (const row of data ?? []) {
    const project = row.project as unknown as Project
    const membership = { ...row, project: undefined } as ProjectMember

    // Get member count
    const { count } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)

    // Get task count
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('archived', false)

    items.push({
      ...project,
      membership,
      member_count: count ?? 0,
      task_count: taskCount ?? 0,
    })
  }

  return items
}

export async function fetchProjectBySlug(
  slug: string,
  userId: string
): Promise<ProjectWithDetails> {
  // Fetch project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single()

  if (projectError) throw projectError

  // Fetch columns
  const { data: columns, error: colError } = await supabase
    .from('project_columns')
    .select('*')
    .eq('project_id', project.id)
    .order('position', { ascending: true })

  if (colError) throw colError

  // Fetch tags
  const { data: tags, error: tagError } = await supabase
    .from('project_tags')
    .select('*')
    .eq('project_id', project.id)
    .order('name', { ascending: true })

  if (tagError) throw tagError

  // Fetch membership
  const { data: membership, error: memError } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', project.id)
    .eq('user_id', userId)
    .single()

  if (memError) throw memError

  // Member count
  const { count } = await supabase
    .from('project_members')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', project.id)

  return {
    ...(project as Project),
    columns: (columns ?? []) as ProjectColumn[],
    tags: (tags ?? []) as ProjectTag[],
    membership: membership as ProjectMember,
    member_count: count ?? 0,
  }
}

export async function createProject(
  name: string,
  slug: string,
  userId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_project_with_defaults', {
    p_name: name,
    p_slug: slug,
    p_user_id: userId,
  })

  if (error) throw error
  return data as string
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update(input)
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return data as Project
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
}
