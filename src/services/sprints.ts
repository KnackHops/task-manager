import { supabase } from '@/lib/supabase'
import type {
  Sprint,
  CreateSprintInput,
  UpdateSprintInput,
} from '@/types/database'

export async function fetchSprints(projectId: string): Promise<Sprint[]> {
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('project_id', projectId)
    .order('start_date', { ascending: false })

  if (error) throw error
  return data as Sprint[]
}

export async function createSprint(
  projectId: string,
  input: CreateSprintInput
): Promise<Sprint> {
  const { data, error } = await supabase
    .from('sprints')
    .insert({
      ...input,
      project_id: projectId,
      status: 'planning',
    })
    .select()
    .single()

  if (error) throw error
  return data as Sprint
}

export async function updateSprint(
  sprintId: string,
  input: UpdateSprintInput
): Promise<Sprint> {
  // If activating, enforce max 1 active sprint per project
  if (input.status === 'active') {
    const { data: sprint } = await supabase
      .from('sprints')
      .select('project_id')
      .eq('id', sprintId)
      .single()

    if (sprint) {
      const { data: activeSprints } = await supabase
        .from('sprints')
        .select('id')
        .eq('project_id', sprint.project_id)
        .eq('status', 'active')
        .neq('id', sprintId)

      if (activeSprints && activeSprints.length > 0) {
        throw new Error('Only one sprint can be active at a time. Complete the current active sprint first.')
      }
    }
  }

  const { data, error } = await supabase
    .from('sprints')
    .update(input)
    .eq('id', sprintId)
    .select()
    .single()

  if (error) throw error
  return data as Sprint
}

export async function deleteSprint(sprintId: string): Promise<void> {
  // Nullify sprint_id on affected tasks before deleting
  await supabase
    .from('tasks')
    .update({ sprint_id: null })
    .eq('sprint_id', sprintId)

  const { error } = await supabase.from('sprints').delete().eq('id', sprintId)
  if (error) throw error
}

export async function autoAssignTasksToSprint(
  sprintId: string,
  sprintColumnId: string,
  projectId: string
): Promise<number> {
  const { data: tasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('column_id', sprintColumnId)
    .eq('archived', false)
    .is('sprint_id', null)

  if (fetchError) throw fetchError
  if (!tasks || tasks.length === 0) return 0

  const taskIds = tasks.map((t) => t.id)
  const { error: updateError } = await supabase
    .from('tasks')
    .update({ sprint_id: sprintId })
    .in('id', taskIds)

  if (updateError) throw updateError
  return taskIds.length
}

export async function bulkAssignTasksToSprint(
  taskIds: string[],
  sprintId: string
): Promise<void> {
  if (taskIds.length === 0) return
  const { error } = await supabase
    .from('tasks')
    .update({ sprint_id: sprintId })
    .in('id', taskIds)
  if (error) throw error
}

export async function completeSprint(
  sprintId: string,
  moveToSprintId?: string | null
): Promise<void> {
  // Mark sprint completed
  const { error: updateError } = await supabase
    .from('sprints')
    .update({ status: 'completed' })
    .eq('id', sprintId)

  if (updateError) throw updateError

  // Move incomplete (non-archived) tasks to target sprint or backlog
  const { data: incompleteTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('sprint_id', sprintId)
    .eq('archived', false)

  if (incompleteTasks && incompleteTasks.length > 0) {
    const taskIds = incompleteTasks.map((t) => t.id)
    const { error: moveError } = await supabase
      .from('tasks')
      .update({ sprint_id: moveToSprintId ?? null })
      .in('id', taskIds)

    if (moveError) throw moveError
  }
}
