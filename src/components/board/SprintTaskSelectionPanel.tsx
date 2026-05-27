import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useTasks } from '@/hooks/useTasks'
import { useBulkAssignSprint } from '@/hooks/useBulkAssignSprint'
import type { Sprint, TaskWithRelations } from '@/types/database'

interface SprintTaskSelectionPanelProps {
  sprint: Sprint
  projectId: string
  onClose: () => void
}

export function SprintTaskSelectionPanel({
  sprint,
  projectId,
  onClose,
}: SprintTaskSelectionPanelProps) {
  const { columns } = useProjectContext()
  const { data: tasks } = useTasks(projectId, { sprintId: null })
  const bulkAssign = useBulkAssignSprint(projectId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const map: Record<string, TaskWithRelations[]> = {}
    for (const col of columns) {
      map[col.id] = []
    }
    if (tasks) {
      for (const task of tasks) {
        map[task.column_id]?.push(task)
      }
    }
    return map
  }, [tasks, columns])

  const toggleTask = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleColumn = (columnId: string) => {
    const columnTasks = grouped[columnId] ?? []
    const allSelected = columnTasks.every((t) => selectedIds.has(t.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const t of columnTasks) {
        if (allSelected) next.delete(t.id)
        else next.add(t.id)
      }
      return next
    })
  }

  const handleAssign = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      onClose()
      return
    }
    bulkAssign.mutate(
      { taskIds: ids, sprintId: sprint.id },
      {
        onSuccess: () => {
          toast.success(`Added ${ids.length} task${ids.length !== 1 ? 's' : ''} to ${sprint.name}`)
          onClose()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const totalUnassigned = tasks?.length ?? 0

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Add Tasks to {sprint.name}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground mb-4">
        Select unassigned tasks to include in this sprint.
      </p>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {columns.map((col) => {
          const colTasks = grouped[col.id] ?? []
          if (colTasks.length === 0) return null
          const allSelected = colTasks.every((t) => selectedIds.has(t.id))
          return (
            <div key={col.id}>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => toggleColumn(col.id)}
                  className="accent-primary"
                />
                {col.name} ({colTasks.length})
              </label>
              <div className="space-y-1 pl-5">
                {colTasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => toggleTask(task.id)}
                      className="accent-primary"
                    />
                    <span className="truncate">{task.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
        {totalUnassigned === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No unassigned tasks to add.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-4">
        {selectedIds.size > 0 && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={selectedIds.size > 0 ? handleAssign : onClose}
          disabled={bulkAssign.isPending}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {selectedIds.size > 0
            ? `Add ${selectedIds.size} Task${selectedIds.size !== 1 ? 's' : ''}`
            : 'Skip'}
        </button>
      </div>
    </Dialog>
  )
}
