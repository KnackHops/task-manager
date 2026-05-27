import { useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useComments, useUpdateComment, useDeleteComment } from '@/hooks/useComments'
import { useMembers } from '@/hooks/useMembers'
import { useTaskAttachments } from '@/hooks/useAttachments'
import { CommentItem } from './CommentItem'
import { CommentForm } from './CommentForm'

interface CommentListProps {
  taskId: string
  projectId: string
}

export function CommentList({ taskId, projectId }: CommentListProps) {
  const { user } = useAuth()
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useComments(taskId)
  const { data: members } = useMembers(projectId)
  const { data: taskAttachments } = useTaskAttachments(taskId)
  const updateComment = useUpdateComment(taskId)
  const deleteComment = useDeleteComment(taskId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  // Flatten pages: older pages first, then newest page
  const comments = useMemo(() => {
    if (!data?.pages) return []
    const pages = [...data.pages]
    // Pages are fetched newest-first, so reverse to get chronological order
    pages.reverse()
    return pages.flatMap((p) => p.data)
  }, [data])

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    const count = comments.length
    if (count > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevCountRef.current = count
  }, [comments.length])

  const handleEdit = (commentId: string, body: string) => {
    updateComment.mutate(
      { commentId, body },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const handleDelete = (commentId: string) => {
    deleteComment.mutate(commentId, {
      onError: (err) => toast.error(err.message),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div
        ref={scrollRef}
        className="max-h-96 overflow-y-auto divide-y divide-border"
      >
        {hasNextPage && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isFetchingNextPage ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Load earlier comments'
              )}
            </button>
          </div>
        )}
        {comments.length > 0 ? (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isOwn={user?.id === comment.author_id}
              members={members ?? []}
              taskAttachments={taskAttachments ?? []}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No comments yet. Start the conversation!
          </p>
        )}
      </div>
      <CommentForm taskId={taskId} projectId={projectId} />
    </div>
  )
}
