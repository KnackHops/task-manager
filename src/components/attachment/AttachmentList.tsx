import { useMemo, useState } from 'react'
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
import { ImageLightbox } from './ImageLightbox'
import { isImageType } from '@/lib/file-utils'

interface AttachmentListProps {
  taskId: string
}

export function AttachmentList({ taskId }: AttachmentListProps) {
  const { user } = useAuth()
  const { data: attachments, isLoading } = useTaskAttachments(taskId)
  const deleteAttachment = useDeleteAttachment(taskId)
  const reorderAttachments = useReorderAttachments(taskId)

  // Carousel pages through every image on the task, not just the clicked one
  const images = useMemo(
    () => (attachments ?? []).filter((a) => isImageType(a.file_type)),
    [attachments]
  )
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewIndex = previewId ? images.findIndex((a) => a.id === previewId) : -1

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
                          onPreview={() => setPreviewId(a.id)}
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

      {previewIndex >= 0 && (
        <ImageLightbox
          images={images}
          startIndex={previewIndex}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  )
}
