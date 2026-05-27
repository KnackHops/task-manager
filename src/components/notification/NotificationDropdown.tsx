import { useRef, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCheck, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/hooks/useNotifications'
import { useAcceptInvite, useDeclineInvite } from '@/hooks/useMembers'
import { formatDistanceToNow } from 'date-fns'
import type { NotificationWithActor } from '@/types/database'

interface NotificationDropdownProps {
  userId: string
  onClose: () => void
}

export function NotificationDropdown({
  userId,
  onClose,
}: NotificationDropdownProps) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications(userId)
  const notifications = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data]
  )
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead(userId)
  const acceptInvite = useAcceptInvite()
  const declineInvite = useDeclineInvite()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleClick = (n: NotificationWithActor) => {
    // Invite notifications handled by buttons, not by clicking row
    if (n.type === 'invite') return

    if (!n.is_read) {
      markAsRead.mutate(n.id)
    }
    onClose()
    if (n.type === 'kick') {
      navigate({ to: '/projects' })
    } else if (n.task_id) {
      navigate({ to: `/p/${n.project_slug}`, search: { task: n.task_id } })
    } else if (n.project_slug) {
      navigate({ to: `/p/${n.project_slug}`, search: { task: undefined, sprint: undefined } })
    }
  }

  const handleAccept = (e: React.MouseEvent, n: NotificationWithActor) => {
    e.stopPropagation()
    if (!n.project_member_id) return
    acceptInvite.mutate(n.project_member_id, {
      onSuccess: () => {
        if (!n.is_read) markAsRead.mutate(n.id)
        toast.success('Invite accepted')
        onClose()
        navigate({ to: `/p/${n.project_slug}`, search: { task: undefined, sprint: undefined } })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleDecline = (e: React.MouseEvent, n: NotificationWithActor) => {
    e.stopPropagation()
    if (!n.project_member_id) return
    declineInvite.mutate(n.project_member_id, {
      onSuccess: () => {
        if (!n.is_read) markAsRead.mutate(n.id)
        toast.success('Invite declined')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 rounded-lg border border-border bg-card shadow-lg z-50"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-foreground">Notifications</span>
        <button
          onClick={() => markAllAsRead.mutate()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : notifications.length > 0 ? (
          <>
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  n.type === 'invite' ? '' : 'cursor-pointer hover:bg-muted/50'
                } ${!n.is_read ? 'bg-primary/5' : ''}`}
              >
                <Avatar
                  name={n.actor?.full_name ?? 'Deleted User'}
                  url={n.actor?.avatar_url ?? null}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.is_read ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {n.message}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>

                  {n.type === 'invite' && n.project_member_id && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={(e) => handleAccept(e, n)}
                        disabled={acceptInvite.isPending}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        Accept
                      </button>
                      <button
                        onClick={(e) => handleDecline(e, n)}
                        disabled={declineInvite.isPending}
                        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Decline
                      </button>
                    </div>
                  )}
                </div>
                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex w-full items-center justify-center gap-2 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Load older'
                )}
              </button>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        )}
      </div>
    </div>
  )
}
