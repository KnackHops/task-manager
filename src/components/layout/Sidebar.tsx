import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Archive,
  Settings,
  ChevronLeft,
  ArrowLeft,
  FolderKanban,
  Timer,
  CalendarRange,
  History,
  UserPlus,
  Star,
  ListTodo,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { usePendingInviteCount } from '@/hooks/useInvites'
import { useMyProjects } from '@/hooks/useProjects'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  projectSlug?: string
}

export function Sidebar({ collapsed, onToggle, projectSlug }: SidebarProps) {
  const router = useRouterState()
  const currentPath = router.location.pathname
  const { user } = useAuth()
  const inviteCount = usePendingInviteCount(user?.id)
  const { data: projects } = useMyProjects()
  const favorites = projects?.filter((p) => p.membership.is_favorite) ?? []

  const projectNav = projectSlug
    ? [
        { to: `/p/${projectSlug}`, label: 'Board', icon: LayoutDashboard, exact: true },
        { to: `/p/${projectSlug}/sprints`, label: 'Sprints', icon: Timer },
        { to: `/p/${projectSlug}/gantt`, label: 'Gantt', icon: CalendarRange },
        { to: `/p/${projectSlug}/logs`, label: 'Logs', icon: History },
        { to: `/p/${projectSlug}/archive`, label: 'Archive', icon: Archive },
        { to: `/p/${projectSlug}/settings`, label: 'Settings', icon: Settings },
      ]
    : []

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground tracking-tight">
            Task Manager
          </span>
        )}
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              collapsed && 'rotate-180'
            )}
          />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {projectSlug ? (
          <>
            {/* Back to projects */}
            <Link
              to="/projects"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {!collapsed && <span>All Projects</span>}
            </Link>

            {/* Project nav items */}
            {projectNav.map((item) => {
              const isActive = item.exact
                ? currentPath === item.to
                : currentPath.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </>
        ) : (
          /* Projects list view — nav top, favorites below */
          <div className="flex flex-1 flex-col">
            {/* Nav links */}
            <div className="space-y-0.5">
              <Link
                to="/my-work"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  currentPath === '/my-work'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <ListTodo className="h-4 w-4 shrink-0" />
                {!collapsed && <span>My Work</span>}
              </Link>
              <Link
                to="/projects"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  currentPath === '/projects'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <FolderKanban className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Projects</span>}
              </Link>
              <Link
                to="/invites"
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  currentPath === '/invites'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-2">
                    Invites
                    {inviteCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {inviteCount}
                      </span>
                    )}
                  </span>
                )}
                {collapsed && inviteCount > 0 && (
                  <span className="absolute left-8 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {inviteCount}
                  </span>
                )}
              </Link>
              <Link
                to="/settings"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  currentPath === '/settings'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </Link>
            </div>

            {/* Favorites section */}
            <div className="mt-2 flex-1 overflow-y-auto border-t border-border pt-2">
              <div className="flex items-center gap-1.5 px-3 py-2">
                <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />
                {!collapsed && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Favorites
                  </span>
                )}
              </div>
              {favorites.length > 0 ? (
                <div className="space-y-0.5">
                  {favorites.map((project) => {
                    const isActive = currentPath.startsWith(`/p/${project.slug}`)
                    return (
                      <Link
                        key={project.id}
                        to="/p/$slug"
                        params={{ slug: project.slug }}
                        search={{ task: undefined, sprint: undefined }}
                        className={cn(
                          'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                        title={project.name}
                      >
                        {!collapsed ? (
                          <span className="truncate">{project.name}</span>
                        ) : (
                          <span className="text-xs font-medium">{project.name.charAt(0).toUpperCase()}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              ) : (
                !collapsed && (
                  <p className="px-3 py-4 text-xs text-muted-foreground/60">
                    Star a project to pin it here
                  </p>
                )
              )}
            </div>
          </div>
        )}
      </nav>
    </aside>
  )
}
