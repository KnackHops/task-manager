import { supabase } from '@/lib/supabase'
import type {
  ProjectColumn,
  CreateColumnInput,
  UpdateColumnInput,
} from '@/types/database'

export async function fetchColumns(
  projectId: string
): Promise<ProjectColumn[]> {
  const { data, error } = await supabase
    .from('project_columns')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectColumn[]
}

export async function createColumn(
  projectId: string,
  input: CreateColumnInput
): Promise<ProjectColumn> {
  // Auto-calculate position if not provided
  let position = input.position
  if (position === undefined) {
    const { data: maxData } = await supabase
      .from('project_columns')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1)

    position = (maxData?.[0]?.position ?? -1) + 1
  }

  const { data, error } = await supabase
    .from('project_columns')
    .insert({
      project_id: projectId,
      name: input.name,
      slug: input.slug,
      position,
    })
    .select()
    .single()

  if (error) throw error
  return data as ProjectColumn
}

export async function updateColumn(
  columnId: string,
  input: UpdateColumnInput
): Promise<ProjectColumn> {
  const { data, error } = await supabase
    .from('project_columns')
    .update(input)
    .eq('id', columnId)
    .select()
    .single()

  if (error) throw error
  return data as ProjectColumn
}

export async function reorderColumns(
  projectId: string,
  columnIds: string[]
): Promise<void> {
  for (let i = 0; i < columnIds.length; i++) {
    const id = columnIds[i]!
    await supabase
      .from('project_columns')
      .update({ position: i })
      .eq('id', id)
      .eq('project_id', projectId)
  }
}

export async function deleteColumn(columnId: string): Promise<void> {
  const { error } = await supabase
    .from('project_columns')
    .delete()
    .eq('id', columnId)

  if (error) throw error
}
