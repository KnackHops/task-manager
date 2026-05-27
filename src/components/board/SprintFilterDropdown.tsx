import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, Check, X, Circle, Calendar, Play, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateSprint, useUpdateSprint } from '@/hooks/useSprints'
import { useProjectContext } from '@/contexts/ProjectContext'
import { autoAssignTasksToSprint } from '@/services/sprints'
import { taskKeys } from '@/hooks/useTasks'
import type { Sprint } from '@/types/database'

interface SprintFilterDropdownProps {
  sprints: Sprint[]
  value: string | undefined
  onChange: (value: string) => void
  canManageSprints: boolean
  projectId: string
  defaultSprintDays?: number
}

function getDefaultDates(durationDays: number) {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + durationDays)
  return {
    start_date: start.toISOString().split('T')[0]!,
    end_date: end.toISOString().split('T')[0]!,
  }
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export interface SprintFilterDropdownHandle {
  openCreate: () => void
  startSprint: (sprint: Sprint) => void
}

export const SprintFilterDropdown = forwardRef<SprintFilterDropdownHandle, SprintFilterDropdownProps>(function SprintFilterDropdown({
  sprints,
  value,
  onChange,
  canManageSprints,
  projectId,
  defaultSprintDays = 7,
}, ref) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const createSprint = useCreateSprint(projectId)
  const updateSprintMutation = useUpdateSprint(projectId)
  const { project } = useProjectContext()
  const queryClient = useQueryClient()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const activeSprints = sprints.filter((s) => s.status === 'active')
  const planningSprints = sprints.filter((s) => s.status === 'planning')
  const completedSprints = sprints.filter((s) => s.status === 'completed')
  const hasActiveSprint = activeSprints.length > 0

  // Derive display label
  const currentLabel =
    value === 'all' || value === undefined
      ? 'All Tasks'
      : value === 'backlog'
        ? 'No Sprint'
        : sprints.find((s) => s.id === value)?.name ?? 'Sprint'

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
    setCreating(false)
  }

  const startCreating = () => {
    const defaults = getDefaultDates(defaultSprintDays)
    setNewStartDate(defaults.start_date)
    setNewEndDate(defaults.end_date)
    setNewName('')
    setCreating(true)
  }

  useImperativeHandle(ref, () => ({
    openCreate() {
      setOpen(true)
      startCreating()
    },
    startSprint(sprint: Sprint) {
      handleStartSprint(sprint, { stopPropagation: () => {} } as React.MouseEvent)
    },
  }))

  const handleCreate = () => {
    if (!newName.trim() || !newStartDate || !newEndDate) return
    createSprint.mutate(
      {
        name: newName.trim(),
        start_date: newStartDate,
        end_date: newEndDate,
      },
      {
        onSuccess: (sprint) => {
          toast.success('Sprint created')
          onChange(sprint.id)
          setCreating(false)
          setOpen(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleStartSprint = (sprint: Sprint, e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasActiveSprint) {
      toast.error('Complete the active sprint before starting another')
      return
    }
    updateSprintMutation.mutate(
      { sprintId: sprint.id, input: { status: 'active' } },
      {
        onSuccess: async () => {
          toast.success('Sprint started')
          onChange(sprint.id)
          setOpen(false)
          if (project.auto_assign_sprint && project.sprint_column_id) {
            try {
              const count = await autoAssignTasksToSprint(
                sprint.id,
                project.sprint_column_id,
                projectId
              )
              if (count > 0) {
                toast.success(`Added ${count} task${count !== 1 ? 's' : ''} to ${sprint.name}`)
              }
              queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
            } catch {
              // Sprint started; don't block on auto-assign failure
            }
          }
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const renderSprintOption = (sprint: Sprint) => {
    const isSelected = value === sprint.id
    return (
      <button
        key={sprint.id}
        onClick={() => handleSelect(sprint.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
        )}
      >
        {sprint.status === 'active' && (
          <Circle className="h-2 w-2 fill-green-400 text-green-400 shrink-0" />
        )}
        <span className="truncate flex-1">{sprint.name}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatDateShort(sprint.start_date)}–{formatDateShort(sprint.end_date)}
        </span>
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="ml-2 flex items-center gap-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground hover:bg-muted transition-colors"
      >
        <span className="max-w-[120px] truncate">{currentLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[calc(100vw-3rem)] sm:w-64 rounded-lg border border-border bg-card shadow-lg p-1">
          {/* Fixed options */}
          <button
            onClick={() => handleSelect('all')}
            className={cn(
              'flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors',
              (value === 'all' || value === undefined)
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-foreground'
            )}
          >
            All Tasks
          </button>
          <button
            onClick={() => handleSelect('backlog')}
            className={cn(
              'flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors',
              value === 'backlog'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-foreground'
            )}
          >
            No Sprint
          </button>

          {/* Sprint sections */}
          {activeSprints.length > 0 && (
            <>
              <div className="h-px bg-border my-1" />
              {activeSprints.map(renderSprintOption)}
            </>
          )}

          {planningSprints.length > 0 && (
            <>
              <div className="h-px bg-border my-1" />
              <p className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                Planning
              </p>
              {planningSprints.map((sprint) => (
                <div key={sprint.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleSelect(sprint.id)}
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors min-w-0',
                      value === sprint.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className="truncate flex-1">{sprint.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDateShort(sprint.start_date)}–{formatDateShort(sprint.end_date)}
                    </span>
                  </button>
                  {canManageSprints && (
                    <button
                      onClick={(e) => handleStartSprint(sprint, e)}
                      disabled={updateSprintMutation.isPending}
                      className="shrink-0 p-1 text-muted-foreground hover:text-green-400 transition-colors disabled:opacity-50"
                      title="Start Sprint"
                    >
                      {updateSprintMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {completedSprints.length > 0 && (
            <>
              <div className="h-px bg-border my-1" />
              <details>
                <summary className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase cursor-pointer hover:text-foreground">
                  Completed ({completedSprints.length})
                </summary>
                {completedSprints.map(renderSprintOption)}
              </details>
            </>
          )}

          {/* Create sprint */}
          {canManageSprints && (
            <>
              <div className="h-px bg-border my-1" />
              {creating ? (
                <div className="p-2 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Sprint name"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button onClick={handleCreate} disabled={createSprint.isPending}>
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </button>
                    <button onClick={() => setCreating(false)}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <div className="relative flex items-center">
                      <input
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                      <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="relative flex items-center">
                      <input
                        type="date"
                        value={newEndDate}
                        onChange={(e) => setNewEndDate(e.target.value)}
                        className="bg-transparent text-muted-foreground outline-none border-b border-input pr-4 cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                      <Calendar className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startCreating}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Sprint
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
})
