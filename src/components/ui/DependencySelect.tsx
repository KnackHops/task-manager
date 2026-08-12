import { useState, useRef, useEffect, useMemo } from 'react'
import { X, ChevronDown, CheckCircle, Search } from 'lucide-react'
import { cn, formatTaskRef } from '@/lib/utils'
import type { TaskWithRelations, TaskDependency } from '@/types/database'

interface DependencySelectProps {
  tasks: TaskWithRelations[]
  currentTaskId: string
  selectedIds: string[]
  onChange: (ids: string[], deps: TaskDependency[]) => void
  label?: string
  prefix?: string
  disabled?: boolean
}

/** Check if adding currentTaskId → candidateId would create a cycle. */
function wouldCreateCycle(
  currentTaskId: string,
  candidateId: string,
  taskMap: Map<string, TaskWithRelations>,
): boolean {
  const visited = new Set<string>()
  const stack = [candidateId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === currentTaskId) return true
    if (visited.has(id)) continue
    visited.add(id)
    const task = taskMap.get(id)
    for (const dep of task?.dependencies ?? []) {
      stack.push(dep.id)
    }
  }
  return false
}

export function DependencySelect({
  tasks,
  currentTaskId,
  selectedIds,
  onChange,
  label,
  prefix,
  disabled = false,
}: DependencySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  )

  const selectedDeps = selectedIds
    .map((id) => taskMap.get(id))
    .filter(Boolean) as TaskWithRelations[]

  const available = useMemo(() => {
    const q = search.toLowerCase()
    return tasks.filter((t) => {
      if (t.id === currentTaskId) return false
      if (q && !t.title.toLowerCase().includes(q) && !String(t.task_number).includes(q))
        return false
      return !wouldCreateCycle(currentTaskId, t.id, taskMap)
    })
  }, [tasks, currentTaskId, search, taskMap])

  const toggle = (id: string) => {
    let next: string[]
    if (selectedIds.includes(id)) {
      next = selectedIds.filter((i) => i !== id)
    } else {
      next = [...selectedIds, id]
    }
    const deps: TaskDependency[] = next
      .map((depId) => {
        const t = taskMap.get(depId)
        return t
          ? { id: t.id, task_number: t.task_number, title: t.title, is_done: t.is_done }
          : null
      })
      .filter(Boolean) as TaskDependency[]
    onChange(next, deps)
  }

  const taskLabel = (t: TaskWithRelations) => formatTaskRef(prefix, t.task_number)

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
          {label}
        </label>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(!open)
          }
        }}
        className={cn(
          'flex min-h-[40px] w-full items-center gap-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selectedDeps.length === 0 ? (
            <span className="text-muted-foreground">No dependencies</span>
          ) : (
            selectedDeps.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <CheckCircle className={cn('h-3 w-3', t.is_done ? 'text-emerald-500' : 'text-muted-foreground')} />
                <span className="font-mono text-[10px] text-primary">
                  {taskLabel(t)}
                </span>
                <span className="max-w-[120px] truncate">{t.title}</span>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {available.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  selectedIds.includes(t.id) ? 'bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <div
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 rounded border',
                    selectedIds.includes(t.id)
                      ? 'border-primary bg-primary'
                      : 'border-input',
                  )}
                >
                  {selectedIds.includes(t.id) && (
                    <svg
                      className="h-3.5 w-3.5 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <CheckCircle className={cn('h-3.5 w-3.5 shrink-0', t.is_done ? 'text-emerald-500' : 'text-muted-foreground')} />
                <span className="shrink-0 font-mono text-[10px] text-primary">
                  {taskLabel(t)}
                </span>
                <span className="truncate text-left">{t.title}</span>
              </button>
            ))}
            {available.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {search ? 'No matching tasks' : 'No available tasks'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
