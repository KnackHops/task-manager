import { createContext, useContext } from 'react'
import type {
  ProjectWithDetails,
  ProjectColumn,
  ProjectTag,
  ProjectMember,
} from '@/types/database'

interface ProjectContextType {
  project: ProjectWithDetails
  columns: ProjectColumn[]
  tags: ProjectTag[]
  membership: ProjectMember
  // Permission helpers
  canCreateTask: boolean
  canEditTask: boolean
  canDeleteTask: boolean
  canArchiveTask: boolean
  canManageColumns: boolean
  canManageMembers: boolean
  canManageSprints: boolean
  isOwner: boolean
}

const ProjectContext = createContext<ProjectContextType | null>(null)

export function ProjectProvider({
  project,
  children,
}: {
  project: ProjectWithDetails
  children: React.ReactNode
}) {
  const m = project.membership
  const isOwner = m.role === 'owner'

  const value: ProjectContextType = {
    project,
    columns: project.columns,
    tags: project.tags,
    membership: m,
    canCreateTask: isOwner || m.can_create_task,
    canEditTask: isOwner || m.can_edit_task,
    canDeleteTask: isOwner || m.can_delete_task,
    canArchiveTask: isOwner || m.can_archive_task,
    canManageColumns: isOwner || m.can_manage_columns,
    canManageMembers: isOwner || m.can_manage_members,
    canManageSprints: isOwner || m.can_manage_sprints,
    isOwner,
  }

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProjectContext must be used within a ProjectProvider')
  }
  return ctx
}
