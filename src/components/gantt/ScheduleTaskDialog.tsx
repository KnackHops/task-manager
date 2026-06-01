import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useUpdateTask } from '@/hooks/useTasks'
import type { TaskWithRelations } from '@/types/database'

interface ScheduleTaskDialogProps {
  task: TaskWithRelations
  defaultStartDate: string
  defaultDueDate: string
  onClose: () => void
  projectId: string
}

export function ScheduleTaskDialog({
  task,
  defaultStartDate,
  defaultDueDate,
  onClose,
  projectId,
}: ScheduleTaskDialogProps) {
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const updateTask = useUpdateTask(projectId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !dueDate) return
    updateTask.mutate(
      {
        taskId: task.id,
        input: { start_date: startDate, due_date: dueDate },
      },
      {
        onSuccess: () => {
          toast.success('Task scheduled')
          onClose()
        },
        onError: () => toast.error('Failed to schedule task'),
      },
    )
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Schedule Task</DialogTitle>
      </DialogHeader>
      <p className="mb-4 truncate text-sm text-muted-foreground">{task.title}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="schedule-start" className="text-sm font-medium text-foreground">
              Start Date
            </label>
            <div className="relative flex items-center">
              <input
                id="schedule-start"
                type="date"
                value={startDate}
                max={dueDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="schedule-due" className="text-sm font-medium text-foreground">
              Due Date
            </label>
            <div className="relative flex items-center">
              <input
                id="schedule-due"
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!startDate || !dueDate || updateTask.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {updateTask.isPending ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
