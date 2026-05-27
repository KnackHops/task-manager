import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Trash2, Archive, ArchiveRestore, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Select'
import { TagSelect } from '@/components/ui/TagSelect'
import { AssigneeSelect } from '@/components/ui/AssigneeSelect'
import { Avatar } from '@/components/ui/Avatar'
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useArchiveTask,
  useUnarchiveTask,
} from '@/hooks/useTasks'
import { useSetTaskTags } from '@/hooks/useTags'
import { useSetTaskAssignees } from '@/hooks/useAssignees'
import { useSprints } from '@/hooks/useSprints'
import { useMembers } from '@/hooks/useMembers'
import { useProjectContext } from '@/contexts/ProjectContext'
import { CommentList } from '@/components/comment/CommentList'
import { AttachmentList } from '@/components/attachment/AttachmentList'
import { useUploadAttachment, useTaskAttachments } from '@/hooks/useAttachments'
import { useAuth } from '@/contexts/AuthContext'
import { parseBody, getFirstName } from '@/lib/mentions'
import { extractClipboardFiles, isImageType, FILE_SIZE_LIMIT, formatFileSize } from '@/lib/file-utils'
import {
  extractRawBody,
  handleEditorBackspace,
  insertPastedImage,
  handleAttachmentDrop,
  populateEditorFromBody,
} from '@/lib/rich-editor'
import { InlineCommentImage } from '@/components/comment/InlineCommentImage'
import { InlineFileLink } from '@/components/comment/InlineFileLink'
import { MentionPopover } from '@/components/comment/MentionPopover'
import { formatDistanceToNow } from 'date-fns'

interface TaskDetailPanelProps {
  taskId: string
  projectId: string
  onClose: () => void
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function TaskDetailPanel({
  taskId,
  projectId,
  onClose,
}: TaskDetailPanelProps) {
  const {
    project,
    columns,
    tags: projectTags,
    doneColumnIds,
    canEditTask,
    canDeleteTask,
    canArchiveTask,
  } = useProjectContext()
  const { data: task, isLoading } = useTask(taskId)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)
  const archiveTask = useArchiveTask(projectId)
  const unarchiveTask = useUnarchiveTask(projectId)
  const setTaskTags = useSetTaskTags(projectId)
  const setTaskAssignees = useSetTaskAssignees(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: members } = useMembers(projectId)
  const { user } = useAuth()
  const uploadAttachment = useUploadAttachment(taskId)
  const { data: taskAttachments } = useTaskAttachments(taskId)

  const [title, setTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => {
    const saved = localStorage.getItem('taskDetailPanelDetailsOpen')
    return saved === null ? true : saved === 'true'
  })
  const descEditorRef = useRef<HTMLDivElement>(null)
  const inlineImagesRef = useRef<Map<string, File>>(new Map())

  const memberMap = useMemo(() => {
    const map = new Map<string, { fullName: string; email: string }>()
    for (const m of members ?? []) {
      map.set(m.user_id, {
        fullName: m.profile.full_name,
        email: m.profile.email,
      })
    }
    return map
  }, [members])

  useEffect(() => {
    if (task) {
      setTitle(task.title)
    }
  }, [task])

  // All hooks must be above the early return
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

      // Non-image files: upload directly as task attachments
      if (user) {
        for (const file of otherFiles) {
          if (file.size > FILE_SIZE_LIMIT) {
            toast.error(`File too large (max ${formatFileSize(FILE_SIZE_LIMIT)}): ${file.name}`)
            continue
          }
          uploadAttachment.mutate(
            { file, uploadedBy: user.id, target: { taskId } },
            { onError: (err) => toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`) }
          )
        }
      }
    },
    [user, taskId, uploadAttachment]
  )

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleEditorBackspace(e, inlineImagesRef.current)
    },
    []
  )

  const handleDescDrop = useCallback(
    async (e: React.DragEvent) => {
      await handleAttachmentDrop(e, () => {})
    },
    []
  )

  // Early return for loading state — all hooks are above this
  if (isLoading || !task) {
    return (
      <Dialog open onClose={onClose} className="max-w-3xl">
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Dialog>
    )
  }

  const handleFieldUpdate = (field: string, value: string | number | null) => {
    updateTask.mutate(
      { taskId, input: { [field]: value } as Record<string, unknown> },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    if (title.trim() && title.trim() !== task.title) {
      handleFieldUpdate('title', title.trim())
    } else {
      setTitle(task.title)
    }
  }

  const startEditingDesc = async () => {
    setIsEditingDesc(true)
    inlineImagesRef.current.clear()
    requestAnimationFrame(async () => {
      if (descEditorRef.current) {
        await populateEditorFromBody(
          descEditorRef.current,
          task.description ?? '',
          taskAttachments ?? [],
          memberMap
        )
        descEditorRef.current.focus()
      }
    })
  }

  const handleDescSave = async () => {
    const el = descEditorRef.current
    if (!el || !user) {
      setIsEditingDesc(false)
      return
    }

    try {
      let finalBody = extractRawBody(el).trim()

      // Upload new inline images (temp → real)
      if (inlineImagesRef.current.size > 0) {
        for (const [tempId, file] of inlineImagesRef.current.entries()) {
          try {
            const attachment = await uploadAttachment.mutateAsync({
              file,
              uploadedBy: user.id,
              target: { taskId },
            })
            finalBody = finalBody.replace(`![](${tempId})`, `![](${attachment.id})`)
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            finalBody = finalBody.replace(`![](${tempId})`, '')
          }
        }
        finalBody = finalBody.trim()
      }

      if (finalBody !== (task.description ?? '')) {
        handleFieldUpdate('description', finalBody || null)
      }
    } finally {
      inlineImagesRef.current.clear()
      setIsEditingDesc(false)
    }
  }

  const handleDescBlur = () => {
    handleDescSave()
  }

  const handleDelete = () => {
    deleteTask.mutate(taskId, {
      onSuccess: () => {
        toast.success('Task deleted')
        setShowDeleteConfirm(false)
        onClose()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleArchive = () => {
    archiveTask.mutate(taskId, {
      onSuccess: () => {
        toast.success('Task archived')
        onClose()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleUnarchive = () => {
    const firstColumn = columns[0]
    if (!firstColumn) return
    unarchiveTask.mutate(
      { taskId, columnId: firstColumn.id },
      {
        onSuccess: () => {
          toast.success('Task unarchived')
          onClose()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleTagsChange = (tagIds: string[]) => {
    const tags = projectTags
      .filter((t) => tagIds.includes(t.id))
      .map(({ id, name, slug, color }) => ({ id, name, slug, color }))
    setTaskTags.mutate(
      { taskId, tagIds, tags },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const handleAssigneesChange = (assigneeIds: string[]) => {
    const assignees = (members ?? [])
      .filter((m) => assigneeIds.includes(m.user_id))
      .map((m) => ({
        id: m.profile.id,
        full_name: m.profile.full_name,
        avatar_url: m.profile.avatar_url,
      }))
    setTaskAssignees.mutate(
      { taskId, assigneeIds, assignees },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const columnOptions = columns.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const currentTagIds = task.tags?.map((t) => t.id) ?? []
  const currentAssigneeIds = task.assignees?.map((a) => a.id) ?? []
  const descSegments = task.description ? parseBody(task.description) : null

  return (
    <Dialog open onClose={onClose} className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-2 pr-8">
          {project.prefix && (
            <span className="text-sm font-medium text-primary font-mono shrink-0">
              {project.prefix}-{task.task_number}
            </span>
          )}
          {isEditingTitle ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
              autoFocus
              className="flex-1 bg-transparent text-lg font-semibold text-foreground outline-none border-b border-primary"
            />
          ) : (
            <DialogTitle>
              <span
                onClick={() => canEditTask && setIsEditingTitle(true)}
                className={canEditTask ? 'hover:text-primary transition-colors cursor-pointer' : ''}
              >
                {task.title}
              </span>
            </DialogTitle>
          )}
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Description */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Description
          </label>
          {isEditingDesc ? (
            <div
              key="desc-editor"
              ref={descEditorRef}
              contentEditable
              onBlur={handleDescBlur}
              onPaste={handleDescPaste}
              onKeyDown={handleDescKeyDown}
              onDrop={handleDescDrop}
              onDragOver={(e) => e.preventDefault()}
              className="mt-1 w-full min-h-[200px] max-h-64 overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_img]:max-w-full [&_img]:rounded-lg"
            />
          ) : (
            <div
              key="desc-read"
              onClick={() => canEditTask && startEditingDesc()}
              className={`mt-1 min-h-[120px] rounded-lg border border-transparent px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words ${canEditTask ? 'hover:border-border transition-colors cursor-pointer' : ''}`}
            >
              {descSegments ? (
                descSegments.map((seg, i) =>
                  seg.type === 'mention' ? (
                    <MentionPopover
                      key={i}
                      name={memberMap.get(seg.userId)?.fullName ?? seg.name}
                      email={memberMap.get(seg.userId)?.email ?? null}
                    >
                      <span className="rounded bg-primary/20 px-1 text-primary font-medium cursor-default">
                        @{getFirstName(seg.name)}
                      </span>
                    </MentionPopover>
                  ) : seg.type === 'image' ? (
                    <InlineCommentImage
                      key={i}
                      attachmentId={seg.attachmentId}
                      attachments={taskAttachments ?? []}
                    />
                  ) : seg.type === 'file_link' ? (
                    <InlineFileLink
                      key={i}
                      attachmentId={seg.attachmentId}
                      fileName={seg.fileName}
                      attachments={taskAttachments ?? []}
                    />
                  ) : (
                    <span key={i}>{seg.value}</span>
                  )
                )
              ) : (
                <span className="text-muted-foreground italic">
                  {canEditTask
                    ? 'Click to add description...'
                    : 'No description'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Attachments
          </label>
          <div className="mt-1">
            <AttachmentList taskId={taskId} />
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
          {task.creator && (
            <div className="flex items-center gap-1.5">
              <Avatar
                name={task.creator.full_name}
                url={task.creator.avatar_url}
                size="sm"
              />
              <span>Created by {task.creator.full_name}</span>
            </div>
          )}
          <span>
            {formatDistanceToNow(new Date(task.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>

        {/* Details (collapsible) */}
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setDetailsOpen((prev) => {
              const next = !prev
              localStorage.setItem('taskDetailPanelDetailsOpen', String(next))
              return next
            })}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Details</span>
            {detailsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {detailsOpen && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Select
                  id="detail-column"
                  label="Column"
                  options={columnOptions}
                  value={task.column_id}
                  onChange={(e) => {
                    const newColId = e.target.value
                    const movingIntoDone = doneColumnIds.includes(newColId) && !doneColumnIds.includes(task.column_id)
                    if (movingIntoDone) {
                      updateTask.mutate(
                        { taskId, input: { column_id: newColId, is_done: true, done_at: new Date().toISOString() } },
                        { onError: (err) => toast.error(err.message) }
                      )
                    } else {
                      handleFieldUpdate('column_id', newColId)
                    }
                  }}
                />

                <Select
                  id="detail-priority"
                  label="Priority"
                  options={PRIORITY_OPTIONS}
                  value={task.priority}
                  onChange={(e) => handleFieldUpdate('priority', e.target.value)}
                />

                <div className="space-y-2">
                  <label htmlFor="detail-sprint" className="text-sm font-medium text-foreground">
                    Sprint
                  </label>
                  <select
                    id="detail-sprint"
                    value={task.sprint_id ?? ''}
                    onChange={(e) => handleFieldUpdate('sprint_id', e.target.value || null)}
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
                  <label htmlFor="detail-story-points" className="text-sm font-medium text-foreground">
                    Story Points
                  </label>
                  <input
                    id="detail-story-points"
                    type="number"
                    min="0"
                    max="100"
                    value={task.story_points ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      handleFieldUpdate('story_points', val ? Number(val) : null)
                    }}
                    placeholder="—"
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <AssigneeSelect
                  members={members ?? []}
                  selectedIds={currentAssigneeIds}
                  onChange={handleAssigneesChange}
                  label="Assignees"
                />

                <TagSelect
                  tags={projectTags}
                  selectedIds={currentTagIds}
                  onChange={handleTagsChange}
                  label="Tags"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {canEditTask && (() => {
                  const inDoneColumn = doneColumnIds.includes(task.column_id)
                  const canToggle = !inDoneColumn || !task.is_done
                  return (
                    <button
                      onClick={() => {
                        if (!canToggle) return
                        updateTask.mutate(
                          {
                            taskId,
                            input: {
                              is_done: !task.is_done,
                              done_at: !task.is_done ? new Date().toISOString() : null,
                            },
                          },
                          { onError: (err) => toast.error(err.message) }
                        )
                      }}
                      disabled={!canToggle}
                      title={!canToggle ? 'Move task out of done column to toggle' : undefined}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        task.is_done
                          ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {task.is_done ? 'Completed' : 'Mark as Done'}
                    </button>
                  )
                })()}

                {canArchiveTask && (
                  <button
                    onClick={task.archived ? handleUnarchive : handleArchive}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {task.archived ? (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </>
                    )}
                  </button>
                )}

                {canDeleteTask && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Task
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Comments
        </h3>
        <CommentList taskId={taskId} projectId={projectId} />
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Task"
        description="Delete this task? This action cannot be undone."
        confirmLabel="Delete"
        isPending={deleteTask.isPending}
      />
    </Dialog>
  )
}
