import { supabase } from '@/lib/supabase'
import type {
  ProjectTag,
  CreateTagInput,
  UpdateTagInput,
} from '@/types/database'

export async function fetchTags(projectId: string): Promise<ProjectTag[]> {
  const { data, error } = await supabase
    .from('project_tags')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectTag[]
}

export async function createTag(
  projectId: string,
  input: CreateTagInput
): Promise<ProjectTag> {
  const { data, error } = await supabase
    .from('project_tags')
    .insert({
      project_id: projectId,
      name: input.name,
      slug: input.slug,
      color: input.color,
    })
    .select()
    .single()

  if (error) throw error
  return data as ProjectTag
}

export async function updateTag(
  tagId: string,
  input: UpdateTagInput
): Promise<ProjectTag> {
  const { data, error } = await supabase
    .from('project_tags')
    .update(input)
    .eq('id', tagId)
    .select()
    .single()

  if (error) throw error
  return data as ProjectTag
}

export async function deleteTag(tagId: string): Promise<void> {
  const { error } = await supabase
    .from('project_tags')
    .delete()
    .eq('id', tagId)

  if (error) throw error
}

export async function setTaskTags(
  taskId: string,
  tagIds: string[]
): Promise<void> {
  // Delete existing tags
  await supabase.from('task_tags').delete().eq('task_id', taskId)

  // Insert new tags
  if (tagIds.length > 0) {
    const rows = tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId }))
    const { error } = await supabase.from('task_tags').insert(rows)
    if (error) throw error
  }
}
