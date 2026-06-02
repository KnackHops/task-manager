import { createFileRoute } from '@tanstack/react-router'
import { useProjectContext } from '@/contexts/ProjectContext'
import { SessionLog } from '@/components/my-work/SessionLog'

export const Route = createFileRoute('/_app/p/$slug/logs')({
  component: LogsPage,
})

function LogsPage() {
  const { project } = useProjectContext()
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Time Logs</h2>
        <p className="text-sm text-muted-foreground">Everyone's tracked time on this project.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionLog filters={{ projectId: project.id }} />
      </div>
    </div>
  )
}
