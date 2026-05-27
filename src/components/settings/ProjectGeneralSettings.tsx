import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateProject } from '@/hooks/useProjects'
import { useProjectContext } from '@/contexts/ProjectContext'

export function ProjectGeneralSettings() {
  const { project, columns } = useProjectContext()
  const updateProject = useUpdateProject(project.slug)

  const [prefix, setPrefix] = useState(project.prefix)
  const [defaultColumnId, setDefaultColumnId] = useState(
    project.default_column_id ?? ''
  )
  const [sprintColumnId, setSprintColumnId] = useState(
    project.sprint_column_id ?? ''
  )
  const [autoAssignSprint, setAutoAssignSprint] = useState(
    project.auto_assign_sprint
  )

  const hasChanges =
    prefix !== project.prefix ||
    (defaultColumnId || null) !== (project.default_column_id ?? null) ||
    (sprintColumnId || null) !== (project.sprint_column_id ?? null) ||
    autoAssignSprint !== project.auto_assign_sprint

  const handleSave = () => {
    const newSprintColumnId = sprintColumnId || null
    const newAutoAssign = newSprintColumnId ? autoAssignSprint : false

    updateProject.mutate(
      {
        projectId: project.id,
        input: {
          prefix,
          default_column_id: defaultColumnId || null,
          sprint_column_id: newSprintColumnId,
          auto_assign_sprint: newAutoAssign,
        },
      },
      {
        onSuccess: () => toast.success('Project settings saved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">General</h3>

      <div className="space-y-4">
        {/* Prefix */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Task ID Prefix
          </label>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            placeholder="e.g. NT"
            maxLength={6}
            className="w-32 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Tasks will display as {prefix ? `${prefix}-1` : '—'}
          </p>
        </div>

        {/* Default Column */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Default Column
          </label>
          <select
            value={defaultColumnId}
            onChange={(e) => setDefaultColumnId(e.target.value)}
            className="w-48 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">None (first column)</option>
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            New tasks default to this column
          </p>
        </div>

        {/* Sprint Column */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Sprint Column
          </label>
          <select
            value={sprintColumnId}
            onChange={(e) => {
              setSprintColumnId(e.target.value)
              if (!e.target.value) setAutoAssignSprint(false)
            }}
            className="w-48 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">None</option>
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Tasks dragged into this column auto-join the active sprint
          </p>
        </div>

        {/* Auto-Assign Sprint Toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAssignSprint}
              onChange={(e) => setAutoAssignSprint(e.target.checked)}
              disabled={!sprintColumnId}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">
              Auto-assign tasks when sprint starts
            </span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 ml-5">
            All unassigned tasks in the sprint column are added when a sprint is activated
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateProject.isPending}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {updateProject.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
