import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useProjectContext } from '@/contexts/ProjectContext'
import { GanttView } from '@/components/gantt/GanttView'
import { TaskDetailPanel } from '@/components/task/TaskDetailPanel'

export const Route = createFileRoute('/_app/p/$slug/gantt')({
  component: GanttPage,
  validateSearch: (search: Record<string, unknown>) => ({
    task: (search.task as string) || undefined,
  }),
})

function GanttPage() {
  const { project } = useProjectContext()
  const navigate = Route.useNavigate()
  const { task: taskFromUrl } = Route.useSearch()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (taskFromUrl) {
      setSelectedTaskId(taskFromUrl)
      navigate({ search: (prev) => ({ ...prev, task: undefined }), replace: true })
    }
  }, [taskFromUrl, navigate])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Gantt</h2>
      </div>
      <div className="min-h-0 flex-1">
        <GanttView projectId={project.id} onTaskClick={setSelectedTaskId} />
      </div>

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={project.id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}
