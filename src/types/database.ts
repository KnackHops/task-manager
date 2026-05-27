// Fixed enums
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type ProjectMemberRole = 'owner' | 'member'
export type SprintStatus = 'planning' | 'active' | 'completed'
export type NotificationType = 'comment' | 'mention' | 'assignment'

// Legacy — kept on profiles table but no longer used for authorization
export type UserRole = 'client' | 'developer' | 'admin'

// --------------- Core Entities ---------------

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  created_at: string
}

export interface Project {
  id: string
  name: string
  slug: string
  prefix: string
  default_column_id: string | null
  sprint_column_id: string | null
  auto_assign_sprint: boolean
  auto_archive_done: boolean
  created_by: string | null
  route_manifest: RouteManifestEntry[]
  default_sprint_days: number
  created_at: string
}

export interface RouteManifestEntry {
  path: string
  label: string
}

export interface ProjectColumn {
  id: string
  project_id: string
  name: string
  slug: string
  position: number
  is_done: boolean
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectMemberRole
  can_create_task: boolean
  can_edit_task: boolean
  can_delete_task: boolean
  can_archive_task: boolean
  can_manage_columns: boolean
  can_manage_members: boolean
  can_manage_sprints: boolean
  is_favorite: boolean
  joined_at: string
}

export interface ProjectMemberWithProfile extends ProjectMember {
  profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>
}

export interface ProjectTag {
  id: string
  project_id: string
  name: string
  slug: string
  color: string
  created_at: string
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  goal: string | null
  start_date: string
  end_date: string
  story_points_target: number | null
  status: SprintStatus
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  column_id: string
  sprint_id: string | null
  created_by: string
  title: string
  description: string | null
  priority: TaskPriority
  position: number
  task_number: number
  archived: boolean
  archived_at: string | null
  is_done: boolean
  done_at: string | null
  story_points: number | null
  route_path: string | null
  route_label: string | null
  created_at: string
  updated_at: string
}

export interface TaskWithRelations extends Task {
  assignees?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  creator?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  column?: Pick<ProjectColumn, 'id' | 'name' | 'slug'> | null
  tags?: Pick<ProjectTag, 'id' | 'name' | 'slug' | 'color'>[]
  comment_count?: number
  attachment_count?: number
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  task_id: string
  comment_id: string | null
  actor_id: string
  message: string
  is_read: boolean
  project_slug: string
  created_at: string
}

export interface NotificationWithActor extends Notification {
  actor: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

export interface Attachment {
  id: string
  task_id: string | null
  comment_id: string | null
  uploaded_by: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  thumbnail_path: string | null
  position: number
  created_at: string
}

export interface AttachmentWithUploader extends Attachment {
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

// --------------- Input Types ---------------

export interface CreateTaskInput {
  title: string
  description?: string
  column_id: string
  priority?: TaskPriority
  sprint_id?: string | null
  story_points?: number | null
  route_path?: string | null
  route_label?: string | null
  tag_ids?: string[]
  assignee_ids?: string[]
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  column_id?: string
  priority?: TaskPriority
  sprint_id?: string | null
  story_points?: number | null
  route_path?: string | null
  route_label?: string | null
  position?: number
  archived?: boolean
  archived_at?: string | null
  is_done?: boolean
  done_at?: string | null
}

export interface CreateProjectInput {
  name: string
  slug: string
}

export interface UpdateProjectInput {
  name?: string
  slug?: string
  prefix?: string
  default_column_id?: string | null
  sprint_column_id?: string | null
  auto_assign_sprint?: boolean
  auto_archive_done?: boolean
  default_sprint_days?: number
}

export interface CreateColumnInput {
  name: string
  slug: string
  position?: number
}

export interface UpdateColumnInput {
  name?: string
  slug?: string
  is_done?: boolean
}

export interface CreateTagInput {
  name: string
  slug: string
  color: string
}

export interface UpdateTagInput {
  name?: string
  slug?: string
  color?: string
}

export interface CreateSprintInput {
  name: string
  goal?: string
  start_date: string
  end_date: string
  story_points_target?: number | null
}

export interface UpdateSprintInput {
  name?: string
  goal?: string | null
  start_date?: string
  end_date?: string
  status?: SprintStatus
  story_points_target?: number | null
}

export interface MemberPermissions {
  can_create_task?: boolean
  can_edit_task?: boolean
  can_delete_task?: boolean
  can_archive_task?: boolean
  can_manage_columns?: boolean
  can_manage_members?: boolean
  can_manage_sprints?: boolean
}

// --------------- Composite Types ---------------

export interface ProjectWithDetails extends Project {
  columns: ProjectColumn[]
  tags: ProjectTag[]
  membership: ProjectMember
  member_count: number
}

export interface ProjectListItem extends Project {
  membership: ProjectMember
  member_count: number
  task_count: number
}
