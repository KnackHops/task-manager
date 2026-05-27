import { useState, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, Star, FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMyProjects } from '@/hooks/useProjects'

interface ProjectSwitcherProps {
  currentSlug?: string
}

export function ProjectSwitcher({ currentSlug }: ProjectSwitcherProps) {
  const { data: projects } = useMyProjects()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = projects?.find((p) => p.slug === currentSlug)
  const filtered = projects?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const favorites = filtered?.filter((p) => p.membership.is_favorite) ?? []
  const others = filtered?.filter((p) => !p.membership.is_favorite) ?? []

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
      >
        <FolderKanban className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground max-w-[150px] truncate">
          {current?.name ?? 'Select project'}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[calc(100vw-3rem)] sm:w-64 rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              autoFocus
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            {favorites.length > 0 && (
              <>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Favorites
                </p>
                {favorites.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setOpen(false)
                      setSearch('')
                      navigate({ to: '/p/$slug', params: { slug: p.slug }, search: { task: undefined, sprint: undefined } })
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      p.slug === currentSlug
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </>
            )}

            {others.length > 0 && (
              <>
                {favorites.length > 0 && (
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground mt-1">
                    All Projects
                  </p>
                )}
                {others.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setOpen(false)
                      setSearch('')
                      navigate({ to: '/p/$slug', params: { slug: p.slug }, search: { task: undefined, sprint: undefined } })
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      p.slug === currentSlug
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </>
            )}

            {!filtered?.length && (
              <p className="px-2 py-3 text-sm text-center text-muted-foreground">
                No projects found
              </p>
            )}
          </div>

          <div className="border-t border-border p-1">
            <button
              onClick={() => {
                setOpen(false)
                navigate({ to: '/projects' })
              }}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              View all projects
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
