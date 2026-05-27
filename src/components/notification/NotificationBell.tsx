import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useUnreadCount,
  useNotificationRealtime,
} from '@/hooks/useNotifications'
import { NotificationDropdown } from './NotificationDropdown'

export function NotificationBell() {
  const { user } = useAuth()
  const { data: unreadCount } = useUnreadCount(user?.id ?? '')
  useNotificationRealtime(user?.id ?? '')
  const [open, setOpen] = useState(false)

  if (!user) return null

  const count = unreadCount ?? 0
  const displayCount = count > 9 ? '9+' : String(count)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {displayCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown userId={user.id} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
