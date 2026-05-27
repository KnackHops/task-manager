import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Archive,
  Settings,
  ChevronLeft,
  ArrowLeft,
  FolderKanban,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  projectSlug?: string
}

export function Sidebar({ collapsed, onToggle, projectSlug }: SidebarProps) {
  const router = useRouterState()
  const currentPath = router.location.pathname

  const projectNav = projectSlug
    ? [
        { to: `/p/${projectSlug}`, label: 'Board', icon: LayoutDashboard, exact: true },
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
          /* Projects list view — minimal nav */
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
        )}
      </nav>
    </aside>
  )
}
