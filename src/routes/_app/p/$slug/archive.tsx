import { createFileRoute } from '@tanstack/react-router'
import { useProjectContext } from '@/contexts/ProjectContext'
import { ArchiveView } from '@/components/archive/ArchiveView'

export const Route = createFileRoute('/_app/p/$slug/archive')({
  component: ArchivePage,
})

function ArchivePage() {
  const { project } = useProjectContext()

  return (
    <div className="h-full overflow-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Archive</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Archived tasks from this project
        </p>
      </div>

      <ArchiveView projectId={project.id} />
    </div>
  )
}
