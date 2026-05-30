import { useState, useRef, useCallback, useMemo } from 'react'
import { Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { TagSelect } from '@/components/ui/TagSelect'
import { AssigneeSelect } from '@/components/ui/AssigneeSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks'
import { useUploadAttachment, attachmentKeys } from '@/hooks/useAttachments'
import { useQueryClient } from '@tanstack/react-query'
import { useSprints } from '@/hooks/useSprints'
import { useMembers } from '@/hooks/useMembers'
import {
  INLINE_IMG_ATTR,
  extractRawBody,
  handleAttachmentDrop,
  insertPastedImage,
  insertFileLinkAtCursor,
  placeCaretAtDropPoint,
  handleEditorBackspace,
  type AttachmentDropData,
} from '@/lib/rich-editor'
import { copyAttachment } from '@/services/attachments'
import {
  extractClipboardFiles,
  isImageType,
  FILE_SIZE_LIMIT,
  formatFileSize,
} from '@/lib/file-utils'
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

  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )

  const firstColumnId =
    defaultColumnId ?? project.default_column_id ?? columns[0]?.id ?? ''

  const [title, setTitle] = useState('')
  const [columnId, setColumnId] = useState(firstColumnId)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? activeSprint?.id ?? '')
  const [storyPoints, setStoryPoints] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [descEmpty, setDescEmpty] = useState(true)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const descEditorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inlineImagesRef = useRef<Map<string, File>>(new Map())
  const inlineFilesRef = useRef<Map<string, File>>(new Map())
  const droppedExistingRef = useRef<Map<string, AttachmentDropData>>(new Map())

  const checkDescEmpty = useCallback(() => {
    if (!descEditorRef.current) return
    const text = descEditorRef.current.textContent ?? ''
    const hasImages = descEditorRef.current.querySelector(`img[${INLINE_IMG_ATTR}]`) !== null
    setDescEmpty(text.trim().length === 0 && !hasImages)
  }, [])

  const handleDescPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = extractClipboardFiles(e)
      if (files.length === 0) return
      e.preventDefault()

      const imageFiles = files.filter((f) => isImageType(f.type))
      const otherFiles = files.filter((f) => !isImageType(f.type))

      for (const imageFile of imageFiles) {
        if (imageFile.size > FILE_SIZE_LIMIT) {
          toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${imageFile.name}`)
          continue
        }
        insertPastedImage(imageFile, inlineImagesRef.current)
      }
      if (imageFiles.length > 0) checkDescEmpty()

      if (otherFiles.length > 0) {
        const oversized = otherFiles.filter((f) => f.size > FILE_SIZE_LIMIT)
        if (oversized.length > 0) {
          toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${oversized.map((f) => f.name).join(', ')}`)
        }
        const valid = otherFiles.filter((f) => f.size <= FILE_SIZE_LIMIT)
        if (valid.length > 0) {
          setStagedFiles((prev) => [...prev, ...valid])
        }
      }
    },
    [checkDescEmpty]
  )

  const handleDescDrop = useCallback(
    async (e: React.DragEvent) => {
      // Staged file chip drag
      const stagedIndex = e.dataTransfer.getData('application/staged-file-index')
      if (stagedIndex) {
        e.preventDefault()
        const index = parseInt(stagedIndex, 10)
        const file = stagedFiles[index]
        if (!file) return
        placeCaretAtDropPoint(e)
        if (isImageType(file.type)) {
          insertPastedImage(file, inlineImagesRef.current)
        } else {
          const tempId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`
          inlineFilesRef.current.set(tempId, file)
          insertFileLinkAtCursor(tempId, file.name)
        }
        checkDescEmpty()
        return
      }
      // Existing attachment drag
      const attData = await handleAttachmentDrop(e, checkDescEmpty)
      if (attData) {
        droppedExistingRef.current.set(attData.id, attData)
      }
    },
    [checkDescEmpty, stagedFiles]
  )

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleEditorBackspace(e, inlineImagesRef.current)) {
        checkDescEmpty()
      }
    },
    [checkDescEmpty]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !columnId || !user) return

    setSubmitting(true)
    try {
      // Extract description from rich editor
      let description: string | undefined
      if (descEditorRef.current) {
        description = extractRawBody(descEditorRef.current).trim() || undefined
      }

      const hasInlineImages = inlineImagesRef.current.size > 0
      const hasInlineFiles = inlineFilesRef.current.size > 0

      // Create task (with temp IDs in description if inline images/files exist)
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

      // Upload inline images/files and copy existing attachments
      const hasDroppedExisting = droppedExistingRef.current.size > 0
      if ((hasInlineImages || hasInlineFiles || hasDroppedExisting) && description) {
        let finalBody = description

        // Upload new inline images
        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttachment.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { taskId: task.id },
            })
            finalBody = finalBody.replace(`![](${tempId})`, `![](${attachment.id})`)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.replace(`![](${tempId})`, '')
          }
        }

        // Upload inline file links (non-images)
        for (const [tempId, file] of inlineFilesRef.current.entries()) {
          try {
            const attachment = await uploadAttachment.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { taskId: task.id },
            })
            finalBody = finalBody.split(`%[${file.name}](${tempId})`).join(`%[${file.name}](${attachment.id})`)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.split(`%[${file.name}](${tempId})`).join('')
          }
        }

        // Copy existing attachments dropped from other sources
        for (const [origId, attData] of droppedExistingRef.current.entries()) {
          // Skip if user deleted the inline reference
          if (!finalBody.includes(`(${origId})`)) continue
          try {
            const copied = await copyAttachment(
              attData.storagePath,
              user.id,
              attData.fileName,
              attData.fileType,
              attData.fileSize ?? 0,
              { taskId: task.id },
            )
            finalBody = finalBody.split(`![](${origId})`).join(`![](${copied.id})`)
            finalBody = finalBody.split(`%[${attData.fileName}](${origId})`).join(`%[${attData.fileName}](${copied.id})`)
          } catch (err) {
            toast.error(`Failed to copy ${attData.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.split(`![](${origId})`).join('')
            finalBody = finalBody.split(`%[${attData.fileName}](${origId})`).join('')
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
      const inlineFiles = new Set([...inlineImagesRef.current.values(), ...inlineFilesRef.current.values()])
      for (const file of stagedFiles) {
        if (inlineFiles.has(file)) continue
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

      <div className="overflow-y-auto flex-1 min-h-0">
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
          <div className="relative">
            <div
              ref={descEditorRef}
              contentEditable
              onInput={checkDescEmpty}
              onPaste={handleDescPaste}
              onDrop={handleDescDrop}
              onDragOver={(e) => e.preventDefault()}
              onKeyDown={handleDescKeyDown}
              className="w-full min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-inset [&_img]:max-w-full [&_img]:rounded-lg"
            />
            {descEmpty && (
              <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                Describe the task...
              </div>
            )}
          </div>
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Attachments
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="sprint" className="text-sm font-medium text-foreground">
              Sprint
            </label>
            <select
              id="sprint"
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none"
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="start-date" className="text-sm font-medium text-foreground">
              Start Date
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              max={dueDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="due-date" className="text-sm font-medium text-foreground">
              Due Date
            </label>
            <input
              id="due-date"
              type="date"
              value={dueDate}
              min={startDate || undefined}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
            />
          </div>
        </div>

        <AssigneeSelect
          members={members ?? []}
          selectedIds={assigneeIds}
          onChange={setAssigneeIds}
          label="Assignees"
          position="top"
        />

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
