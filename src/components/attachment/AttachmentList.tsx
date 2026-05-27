import { toast } from 'sonner'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { useAuth } from '@/contexts/AuthContext'
import {
  useTaskAttachments,
  useDeleteAttachment,
  useReorderAttachments,
} from '@/hooks/useAttachments'
import { AttachmentItem } from './AttachmentItem'
import { FileUpload } from './FileUpload'

interface AttachmentListProps {
  taskId: string
}

export function AttachmentList({ taskId }: AttachmentListProps) {
  const { user } = useAuth()
  const { data: attachments, isLoading } = useTaskAttachments(taskId)
  const deleteAttachment = useDeleteAttachment(taskId)
  const reorderAttachments = useReorderAttachments(taskId)

  const handleDelete = (id: string, storagePath: string) => {
    deleteAttachment.mutate(
      { id, storagePath },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !attachments) return
    if (result.source.index === result.destination.index) return

    const reordered = Array.from(attachments)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved!)

    reorderAttachments.mutate(reordered.map((a) => a.id))
  }

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : attachments && attachments.length > 0 ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="attachment-list">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-1.5"
              >
                {attachments.map((a, index) => (
                  <Draggable key={a.id} draggableId={a.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <AttachmentItem
                          attachment={a}
                          canDelete={user?.id === a.uploaded_by}
                          onDelete={handleDelete}
                          dragHandleProps={provided.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : null}

      <FileUpload taskId={taskId} />
    </div>
  )
}
