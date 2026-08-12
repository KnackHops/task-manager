import { useMemo, useState, useRef, useCallback, forwardRef } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ChevronUp, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useComments, useUpdateComment, useDeleteComment } from '@/hooks/useComments'
import { useMembers } from '@/hooks/useMembers'
import { useTaskAttachments } from '@/hooks/useAttachments'
import { CommentItem } from './CommentItem'
import { CommentForm } from './CommentForm'

interface CommentListProps {
  taskId: string
  projectId: string
  /** Renders the "Reply" action in the header row when provided. */
  onReply?: () => void
  readOnly?: boolean
}

export const CommentList = forwardRef<HTMLDivElement, CommentListProps>(
  function CommentList({ taskId, projectId, onReply, readOnly = false }, ref) {
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

    // Flatten pages: older pages first, then newest page
    const comments = useMemo(() => {
      if (!data?.pages) return []
      const pages = [...data.pages]
      // Pages are fetched newest-first, so reverse to get chronological order
      pages.reverse()
      return pages.flatMap((p) => p.data)
    }, [data])

    const totalCount = data?.pages[0]?.totalCount
    const loadedCount = comments.length

    // Collapsed by default: show only the newest few comments, then reveal them
    // in small batches instead of dumping the whole thread at once.
    const VISIBLE = 4
    const STEP = 5
    const [visibleCount, setVisibleCount] = useState(VISIBLE)
    const knownCount = totalCount ?? loadedCount
    const shownCount = Math.min(visibleCount, loadedCount)
    const hiddenCount = Math.max(0, knownCount - shownCount)
    const nextBatch = Math.min(STEP, hiddenCount)
    const visibleComments = comments.slice(-shownCount)

    const isExpanded = shownCount > VISIBLE
    const bottomRef = useRef<HTMLDivElement>(null)

    const handleShowMore = () => {
      const next = shownCount + STEP
      setVisibleCount(next)
      // Pull the next page when the reveal outruns what's loaded
      if (next > loadedCount && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    const scrollToLatest = useCallback(() => {
      // Wait a frame so any collapse has re-laid out before scrolling
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }, [])

    const handleCollapse = () => {
      setVisibleCount(VISIBLE)
      scrollToLatest()
    }

    const handleEdit = async (commentId: string, body: string) => {
      try {
        await updateComment.mutateAsync({ commentId, body })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update comment')
      }
    }

    const handleDelete = (commentId: string) => {
      deleteComment.mutate(commentId, {
        onError: (err) => toast.error(err.message),
      })
    }

    // Thread controls live inline in the header row, between the title and Reply
    const controls = isLoading ? null : (
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
        {hiddenCount > 0 && (
          <button
            onClick={handleShowMore}
            disabled={isFetchingNextPage}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-60"
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Show {nextBatch} more
                <span className="text-muted-foreground">({hiddenCount} hidden)</span>
              </>
            )}
          </button>
        )}
        {isExpanded && (
          <>
            {hiddenCount > 0 && <span className="text-xs text-border">|</span>}
            <button
              onClick={handleCollapse}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Collapse
            </button>
            <span className="text-xs text-border">|</span>
            <button
              onClick={scrollToLatest}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Latest
            </button>
          </>
        )}
      </div>
    )

    const header = (
      <div className="mb-3 flex items-center gap-3">
        <h3 className="shrink-0 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Comments
        </h3>
        {controls}
        {onReply && !readOnly && (
          <button
            type="button"
            onClick={onReply}
            className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Reply
          </button>
        )}
      </div>
    )

    if (isLoading) {
      return (
        <div>
          {header}
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </div>
      )
    }

    return (
      <div>
        {header}
        <div className="divide-y divide-border">
          {comments.length > 0 ? (
            visibleComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isOwn={user?.id === comment.author_id}
                members={members ?? []}
                taskAttachments={taskAttachments ?? []}
                onEdit={handleEdit}
                onDelete={handleDelete}
                readOnly={readOnly}
              />
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No comments yet. Start the conversation!
            </p>
          )}
        </div>

        {/* Anchor for "Latest" + a collapse control reachable from the bottom */}
        <div ref={bottomRef} className="scroll-mt-4">
          {isExpanded && (
            <div className="flex justify-center py-2">
              <button
                onClick={handleCollapse}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Collapse comments
              </button>
            </div>
          )}
        </div>

        {!readOnly && (
          <div ref={ref}>
            <CommentForm taskId={taskId} projectId={projectId} />
          </div>
        )}
      </div>
    )
  }
)
