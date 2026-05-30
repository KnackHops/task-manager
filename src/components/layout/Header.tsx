import { Moon, Sun, Menu, LogOut } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getTheme, toggleTheme } from '@/lib/theme'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate, Link } from '@tanstack/react-router'
import { ProjectSwitcher } from '@/components/project/ProjectSwitcher'
import { NotificationBell } from '@/components/notification/NotificationBell'

interface HeaderProps {
  onMenuClick: () => void
  projectSlug?: string
}

export function Header({ onMenuClick, projectSlug }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [theme, setThemeState] = useState(getTheme)

  useEffect(() => {
    setThemeState(getTheme())
  }, [])

  const handleToggleTheme = () => {
    const next = toggleTheme()
    setThemeState(next)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/login' })
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <ProjectSwitcher currentSlug={projectSlug} />
      </div>

      <div className="flex items-center gap-2">
        {profile && (
          <Link to="/settings" className="text-xs text-muted-foreground hidden sm:block capitalize hover:text-foreground transition-colors">
            {profile.full_name}
          </Link>
        )}
        <NotificationBell />
        <button
          onClick={handleToggleTheme}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={handleSignOut}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
