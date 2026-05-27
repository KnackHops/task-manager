import { useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'

interface NotificationDropdownProps {
  userId: string
  onClose: () => void
}

export function NotificationDropdown({
  userId,
  onClose,
}: NotificationDropdownProps) {
  const { data: notifications, isLoading } = useNotifications(userId)
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead(userId)
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

  const handleClick = (notificationId: string, projectSlug: string, taskId: string, isRead: boolean) => {
    if (!isRead) {
      markAsRead.mutate(notificationId)
    }
    onClose()
    navigate({ to: `/p/${projectSlug}`, search: { task: taskId } })
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-card shadow-lg z-50"
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
        ) : notifications && notifications.length > 0 ? (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n.id, n.project_slug, n.task_id, n.is_read)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                !n.is_read ? 'bg-primary/5' : ''
              }`}
            >
              <Avatar
                name={n.actor.full_name}
                url={n.actor.avatar_url}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!n.is_read ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {n.message}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </div>
              {!n.is_read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        )}
      </div>
    </div>
  )
}
