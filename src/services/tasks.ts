import { supabase } from '@/lib/supabase'
import type {
  Task,
  TaskWithRelations,
  CreateTaskInput,
  UpdateTaskInput,
} from '@/types/database'
import { setTaskTags } from './tags'
import { setTaskAssignees } from './assignees'

const TASK_SELECT = `
  *,
  creator:profiles!created_by(id, full_name, avatar_url),
  column:project_columns!column_id(id, name, slug),
  task_tags(
    tag:project_tags!tag_id(id, name, slug, color)
  ),
  task_assignees(
    assignee:profiles!assignee_id(id, full_name, avatar_url)
  ),
  comments(count),
  attachments(count)
`

function flattenTaskRow(row: Record<string, unknown>): TaskWithRelations {
  const { task_tags, task_assignees, comments, attachments, ...rest } = row
  const tags = Array.isArray(task_tags)
    ? (task_tags as { tag: unknown }[]).map((tt) => tt.tag).filter(Boolean)
    : []
  const assignees = Array.isArray(task_assignees)
    ? (task_assignees as { assignee: unknown }[]).map((ta) => ta.assignee).filter(Boolean)
    : []
  const comment_count = Array.isArray(comments) ? (comments[0] as { count: number })?.count ?? 0 : 0
  const attachment_count = Array.isArray(attachments) ? (attachments[0] as { count: number })?.count ?? 0 : 0
  return { ...rest, tags, assignees, comment_count, attachment_count } as TaskWithRelations
}

export async function fetchTasks(
  projectId: string,
  filters?: {
    columnId?: string
    sprintId?: string | null
    archived?: boolean
    tagSlug?: string
  }
): Promise<TaskWithRelations[]> {
  let query = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('project_id', projectId)
    .order('position', { ascending: true })

  // Default: hide archived tasks
  if (filters?.archived !== undefined) {
    query = query.eq('archived', filters.archived)
  } else {
    query = query.eq('archived', false)
  }

  if (filters?.columnId) {
    query = query.eq('column_id', filters.columnId)
  }

  if (filters?.sprintId !== undefined) {
    if (filters.sprintId === null) {
      query = query.is('sprint_id', null)
    } else {
      query = query.eq('sprint_id', filters.sprintId)
    }
  }

  const { data, error } = await query
  if (error) throw error

  const tasks = (data ?? []).map((row) => flattenTaskRow(row as Record<string, unknown>))

  // Client-side filter by tag slug if needed
  if (filters?.tagSlug) {
    return tasks.filter((t) =>
      t.tags?.some((tag) => tag.slug === filters.tagSlug)
    )
  }

  return tasks
}

export async function fetchTask(
  taskId: string
): Promise<TaskWithRelations> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', taskId)
    .single()

  if (error) throw error
  return flattenTaskRow(data as Record<string, unknown>)
}

export const ARCHIVED_PAGE_SIZE = 30

export async function fetchArchivedTasks(
  projectId: string,
  filters: {
    search?: string
    sprintId?: string | null
  },
  page: number
): Promise<{ data: TaskWithRelations[]; hasMore: boolean }> {
  const from = page * ARCHIVED_PAGE_SIZE
  const to = from + ARCHIVED_PAGE_SIZE // fetch one extra to detect hasMore

  let query = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('project_id', projectId)
    .eq('archived', true)
    .order('archived_at', { ascending: false })
    .range(from, to)

  if (filters.search?.trim()) {
    query = query.ilike('title', `%${filters.search.trim()}%`)
  }

  if (filters.sprintId !== undefined) {
    if (filters.sprintId === null) {
      query = query.is('sprint_id', null)
    } else {
      query = query.eq('sprint_id', filters.sprintId)
    }
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []).map((row) => flattenTaskRow(row as Record<string, unknown>))
  const hasMore = rows.length > ARCHIVED_PAGE_SIZE
  if (hasMore) rows.pop()

  return { data: rows, hasMore }
}

export async function createTask(
  projectId: string,
  createdBy: string,
  input: CreateTaskInput
): Promise<Task> {
  const { tag_ids, assignee_ids, ...taskInput } = input

  // Auto-calculate position
  const { data: maxPosData } = await supabase
    .from('tasks')
    .select('position')
    .eq('project_id', projectId)
    .eq('column_id', input.column_id)
    .eq('archived', false)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = (maxPosData?.[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...taskInput,
      project_id: projectId,
      created_by: createdBy,
      position: nextPosition,
    })
    .select()
    .single()

  if (error) throw error

  // Set tags if provided
  if (tag_ids && tag_ids.length > 0) {
    await setTaskTags(data.id, tag_ids)
  }

  // Set assignees if provided
  if (assignee_ids && assignee_ids.length > 0) {
    await setTaskAssignees(data.id, assignee_ids)
  }

  return data as Task
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(input)
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data as Task
}

export async function archiveTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data as Task
}

export async function unarchiveTask(
  taskId: string,
  columnId: string
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      archived: false,
      archived_at: null,
      column_id: columnId,
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data as Task
}

export async function reorderTask(
  taskId: string,
  newColumnId: string,
  newPosition: number,
  projectId: string,
  sprintIdOverride?: string | null,
  isDoneOverride?: { is_done: boolean; done_at: string | null }
): Promise<void> {
  const { data: columnTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, position')
    .eq('project_id', projectId)
    .eq('column_id', newColumnId)
    .eq('archived', false)
    .neq('id', taskId)
    .order('position', { ascending: true })

  if (fetchError) throw fetchError

  const tasks = columnTasks ?? []
  tasks.splice(newPosition, 0, { id: taskId, position: newPosition })

  const updates = []
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!
    if (t.id === taskId) {
      const updatePayload: Record<string, unknown> = {
        column_id: newColumnId,
        position: i,
      }
      if (sprintIdOverride !== undefined) {
        updatePayload.sprint_id = sprintIdOverride
      }
      if (isDoneOverride !== undefined) {
        updatePayload.is_done = isDoneOverride.is_done
        updatePayload.done_at = isDoneOverride.done_at
      }
      updates.push(
        supabase
          .from('tasks')
          .update(updatePayload)
          .eq('id', taskId)
          .then()
      )
    } else if (t.position !== i) {
      updates.push(
        supabase.from('tasks').update({ position: i }).eq('id', t.id).then()
      )
    }
  }
  await Promise.all(updates)
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}
