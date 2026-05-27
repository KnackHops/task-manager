import { createFileRoute } from '@tanstack/react-router'
import { useProjectContext } from '@/contexts/ProjectContext'
import { ProjectGeneralSettings } from '@/components/settings/ProjectGeneralSettings'
import { ColumnManager } from '@/components/settings/ColumnManager'
import { TagManager } from '@/components/settings/TagManager'
import { SprintManager } from '@/components/settings/SprintManager'
import { MemberManager } from '@/components/settings/MemberManager'

export const Route = createFileRoute('/_app/p/$slug/settings')({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { project, canManageColumns, canManageMembers, canManageSprints, isOwner } =
    useProjectContext()

  return (
    <div className="h-full overflow-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          Project Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{project.name}</p>
      </div>

      <div className="space-y-8 max-w-2xl">
        {canManageColumns && <ProjectGeneralSettings />}

        {canManageColumns && (
          <ColumnManager
            projectId={project.id}
            projectSlug={project.slug}
          />
        )}

        {canManageColumns && (
          <TagManager
            projectId={project.id}
            projectSlug={project.slug}
          />
        )}

        {canManageSprints && (
          <SprintManager projectId={project.id} />
        )}

        {canManageMembers && (
          <MemberManager
            projectId={project.id}
            isOwner={isOwner}
          />
        )}
      </div>
    </div>
  )
}
