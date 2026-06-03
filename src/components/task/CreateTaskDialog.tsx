import { useState, useRef, useMemo } from 'react'
import { Calendar, GripVertical, Paperclip, X } from 'lucide-react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { TagSelect } from '@/components/ui/TagSelect'
import { AssigneeSelect } from '@/components/ui/AssigneeSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useCreateTask, useUpdateTask, useTasks, taskKeys } from '@/hooks/useTasks'
import { useUploadAttachment, attachmentKeys } from '@/hooks/useAttachments'
import { useQueryClient } from '@tanstack/react-query'
import { useSprints } from '@/hooks/useSprints'
import { useMembers } from '@/hooks/useMembers'
import { DependencySelect } from '@/components/ui/DependencySelect'
import { setTaskDependencies } from '@/services/dependencies'
import { createChecklistItem } from '@/services/checklists'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import {
  FILE_SIZE_LIMIT,
  formatFileSize,
} from '@/lib/file-utils'
import { replaceInlineTempId, removeInlineTempId } from '@/lib/rich-editor'
import type { TaskPriority } from '@/types/database'

interface CreateTaskDialogProps {
  projectId: string
  onClose: () => void
  defaultColumnId?: string
  defaultSprintId?: string
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function CreateTaskDialog({
  projectId,
  onClose,
  defaultColumnId,
  defaultSprintId,
}: CreateTaskDialogProps) {
  const { user } = useAuth()
  const { project, columns, tags } = useProjectContext()
  const queryClient = useQueryClient()
  const createTask = useCreateTask(projectId, user!.id)
  const updateTask = useUpdateTask(projectId)
  const uploadAttachment = useUploadAttachment()
  const { data: members } = useMembers(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: allProjectTasks } = useTasks(projectId)

  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )

  const isDefaultSprintActive = defaultSprintId && activeSprint?.id === defaultSprintId
  const firstColumnId =
    defaultColumnId
    ?? (isDefaultSprintActive && project.sprint_column_id ? project.sprint_column_id : null)
    ?? project.default_column_id
    ?? columns[0]?.id
    ?? ''

  const [title, setTitle] = useState('')
  const [columnId, setColumnId] = useState(firstColumnId)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? '')
  const [storyPoints, setStoryPoints] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [dependencyIds, setDependencyIds] = useState<string[]>([])
  const [descRaw, setDescRaw] = useState('')
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [checklistItems, setChecklistItems] = useState<string[]>([])
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImagesRef = useRef<Map<string, File>>(new Map())

  const handleChecklistDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return
    setChecklistItems((prev) => {
      const reordered = Array.from(prev)
      const [moved] = reordered.splice(result.source.index, 1)
      reordered.splice(result.destination!.index, 0, moved!)
      return reordered
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !columnId || !user) return

    setSubmitting(true)
    try {
      const description = descRaw.trim() || undefined

      const hasInlineImages = inlineImagesRef.current.size > 0

      // Create task (with temp IDs in description if inline images exist)
      const task = await createTask.mutateAsync({
        title: title.trim(),
        description,
        column_id: columnId,
        priority,
        sprint_id: sprintId || null,
        story_points: storyPoints ? Number(storyPoints) : null,
        start_date: startDate || null,
        due_date: dueDate || null,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        assignee_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
      })

      // Upload inline images and replace temp IDs in description
      if (hasInlineImages && description) {
        let finalBody = description

        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttachment.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { taskId: task.id },
            })
            finalBody = replaceInlineTempId(finalBody, tempId, attachment.id, file.name)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = removeInlineTempId(finalBody, tempId)
          }
        }

        finalBody = finalBody.trim()
        await queryClient.invalidateQueries({ queryKey: attachmentKeys.task(task.id) })
        if (finalBody !== description) {
          updateTask.mutate({
            taskId: task.id,
            input: { description: finalBody || null },
          })
        }
      }

      // Upload staged files
      const inlineImageFiles = new Set(inlineImagesRef.current.values())
      for (const file of stagedFiles) {
        if (inlineImageFiles.has(file)) continue
        try {
          await uploadAttachment.mutateAsync({
            file,
            uploadedBy: user.id,
            target: { taskId: task.id },
          })
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      // Set dependencies after task creation
      if (dependencyIds.length > 0) {
        try {
          await setTaskDependencies(task.id, dependencyIds)
        } catch (err) {
          toast.error(`Failed to set dependencies: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      // Create checklist items after task creation
      if (checklistItems.length > 0) {
        for (let i = 0; i < checklistItems.length; i++) {
          try {
            await createChecklistItem(task.id, checklistItems[i]!, i)
          } catch (err) {
            toast.error(`Failed to create checklist item: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }
        queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
      }

      toast.success('Task created')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const columnOptions = columns.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <Dialog open onClose={onClose} className="max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>New Task</DialogTitle>
      </DialogHeader>

      <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="title"
            className="text-sm font-medium text-foreground"
          >
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset"
            placeholder="Task title"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Description
          </label>
          <RichTextEditor
            content={descRaw}
            onChange={setDescRaw}
            placeholder="Describe the task..."
            members={members ?? []}
            onImagePaste={(file) => {
              if (file.size > FILE_SIZE_LIMIT) {
                toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                return null
              }
              const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
              inlineImagesRef.current.set(tempId, file)
              return tempId
            }}
            stagedFiles={stagedFiles}
            onStagedFileDrop={(file) => {
              if (file.size > FILE_SIZE_LIMIT) {
                toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
                return null
              }
              const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
              inlineImagesRef.current.set(tempId, file)
              return tempId
            }}
            minHeight="5rem"
          />
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Attachments
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset"
          >
            <Paperclip className="h-4 w-4" />
            <span>Add files</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                const arr = Array.from(e.target.files)
                const oversized = arr.filter((f) => f.size > FILE_SIZE_LIMIT)
                if (oversized.length > 0) {
                  toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${oversized.map((f) => f.name).join(', ')}`)
                }
                const valid = arr.filter((f) => f.size <= FILE_SIZE_LIMIT)
                if (valid.length > 0) {
                  setStagedFiles((prev) => [...prev, ...valid])
                }
              }
              e.target.value = ''
            }}
            className="hidden"
          />
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stagedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/staged-file-index', String(i))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground cursor-grab"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="ml-0.5 hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Checklist</label>
          {checklistItems.length > 0 && (
            <DragDropContext onDragEnd={handleChecklistDragEnd}>
              <Droppable droppableId="staged-checklist">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                    {checklistItems.map((item, i) => (
                      <Draggable key={i} draggableId={`checklist-${i}`} index={i}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-sm"
                          >
                            <div {...provided.dragHandleProps} className="shrink-0 cursor-grab text-muted-foreground">
                              <GripVertical className="h-3.5 w-3.5" />
                            </div>
                            <div className="h-4 w-4 rounded border border-border shrink-0" />
                            <span className="flex-1 min-w-0 truncate">{item}</span>
                            <button
                              type="button"
                              onClick={() => setChecklistItems((prev) => prev.filter((_, idx) => idx !== i))}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
          <input
            type="text"
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newChecklistTitle.trim()) {
                e.preventDefault()
                setChecklistItems((prev) => [...prev, newChecklistTitle.trim()])
                setNewChecklistTitle('')
              }
            }}
            placeholder="Add checklist item..."
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset"
          />
        </div>

        <TagSelect
          tags={tags}
          selectedIds={selectedTagIds}
          onChange={setSelectedTagIds}
          label="Tags"
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            id="column"
            label="Column"
            options={columnOptions}
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
          />
          <Select
            id="priority"
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          />

          <div className="space-y-2">
            <label htmlFor="sprint" className="text-sm font-medium text-foreground">
              Sprint
            </label>
            <select
              id="sprint"
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset appearance-none"
            >
              <option value="">No Sprint</option>
              {sprints
                ?.filter((s) => s.status !== 'completed')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.status === 'active' ? ' ●' : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="story-points" className="text-sm font-medium text-foreground">
              Story Points
            </label>
            <input
              id="story-points"
              type="number"
              min="0"
              max="100"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="—"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="start-date" className="text-sm font-medium text-foreground">
              Start Date
            </label>
            <div className="relative flex items-center">
              <input
                id="start-date"
                type="date"
                value={startDate}
                max={dueDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="due-date" className="text-sm font-medium text-foreground">
              Due Date
            </label>
            <div className="relative flex items-center">
              <input
                id="due-date"
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="col-span-2">
            <AssigneeSelect
              members={members ?? []}
              selectedIds={assigneeIds}
              onChange={setAssigneeIds}
              label="Assignees"
              position="top"
            />
          </div>

          <div className="col-span-2">
            <DependencySelect
              tasks={allProjectTasks ?? []}
              currentTaskId=""
              selectedIds={dependencyIds}
              onChange={(ids) => setDependencyIds(ids)}
              label="Dependencies"
              prefix={project.prefix}
            />
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
            disabled={submitting || !title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
      </div>
    </Dialog>
  )
}
