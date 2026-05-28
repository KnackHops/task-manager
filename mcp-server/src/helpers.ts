import type { SupabaseClient } from '@supabase/supabase-js'

// ── Task ID parsing ─────────────────────────────────────────────────

const TASK_ID_REGEX = /^([A-Z]+)-(\d+)$/

export function parseTaskId(id: string): { prefix: string; number: number } | null {
  const match = id.match(TASK_ID_REGEX)
  if (!match) return null
  return { prefix: match[1]!, number: parseInt(match[2]!, 10) }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUUID(str: string): boolean {
  return UUID_REGEX.test(str)
}

// ── Slug resolution ─────────────────────────────────────────────────

export async function resolveProject(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) throw new Error(`Project "${slug}" not found`)
  return data
}

export async function resolveColumn(supabase: SupabaseClient, projectId: string, slug: string) {
  const { data, error } = await supabase
    .from('project_columns')
    .select('*')
    .eq('project_id', projectId)
    .eq('slug', slug)
    .single()
  if (error) throw new Error(`Column "${slug}" not found`)
  return data
}

export async function resolveTag(supabase: SupabaseClient, projectId: string, slug: string) {
  const { data, error } = await supabase
    .from('project_tags')
    .select('*')
    .eq('project_id', projectId)
    .eq('slug', slug)
    .single()
  if (error) throw new Error(`Tag "${slug}" not found`)
  return data
}

export async function resolveSprint(supabase: SupabaseClient, projectId: string, name: string) {
  if (name.toLowerCase() === 'active') {
    const { data, error } = await supabase
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .single()
    if (error) throw new Error('No active sprint found')
    return data
  }
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('project_id', projectId)
    .ilike('name', name)
    .single()
  if (error) throw new Error(`Sprint "${name}" not found`)
  return data
}

export async function resolveAssignee(supabase: SupabaseClient, projectId: string, name: string) {
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, profiles!inner(id, full_name, email)')
    .eq('project_id', projectId)
    .ilike('profiles.full_name', `%${name}%`)
  if (error || !data || data.length === 0) {
    throw new Error(`Assignee "${name}" not found in project`)
  }
  return data[0]!
}

// ── Task resolution (handles NT-1 or UUID) ──────────────────────────

export async function resolveTaskId(supabase: SupabaseClient, taskId: string): Promise<string> {
  if (isUUID(taskId)) return taskId

  const parsed = parseTaskId(taskId)
  if (!parsed) throw new Error(`Invalid task ID format: "${taskId}". Use NT-1 format or UUID.`)

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('prefix', parsed.prefix)
    .single()
  if (projectError) throw new Error(`No project with prefix "${parsed.prefix}"`)

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', project.id)
    .eq('task_number', parsed.number)
    .single()
  if (taskError) throw new Error(`Task ${taskId} not found`)

  return task.id
}

// ── Formatting ──────────────────────────────────────────────────────

export function formatTaskId(prefix: string, taskNumber: number): string {
  return prefix ? `${prefix}-${taskNumber}` : `#${taskNumber}`
}

export function formatTaskLine(
  task: {
    task_number: number
    title: string
    priority: string
    story_points: number | null
    route_path: string | null
    column?: { name: string } | null
    tags?: { name: string }[]
    assignees?: { full_name: string }[]
    sprint?: { name: string } | null
  },
  prefix: string
): string {
  const id = formatTaskId(prefix, task.task_number)
  const parts: string[] = [`${id}: ${task.title}`]

  if (task.column) parts.push(`[${task.column.name}]`)
  parts.push(`[${task.priority}]`)
  if (task.assignees?.length) {
    parts.push(task.assignees.map((a) => `@${a.full_name}`).join(' '))
  }
  if (task.tags?.length) {
    parts.push(task.tags.map((t) => `#${t.name}`).join(' '))
  }
  if (task.sprint) parts.push(`(${task.sprint.name})`)
  if (task.story_points) parts.push(`${task.story_points}pts`)
  if (task.route_path) parts.push(`→ ${task.route_path}`)

  return parts.join(' ')
}
