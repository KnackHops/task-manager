import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, Star } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { useMyProjects } from '@/hooks/useProjects'
import { useToggleFavorite } from '@/hooks/useMembers'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'
import type { ProjectListItem } from '@/types/database'

export const Route = createFileRoute('/_app/projects')({
  component: ProjectsPage,
})

function ProjectCard({
  project,
  onToggleFavorite,
}: {
  project: ProjectListItem
  onToggleFavorite: (projectId: string, isFavorite: boolean) => void
}) {
  return (
    <div className="group relative rounded-lg border border-border bg-card p-4 hover:border-primary/50 transition-colors">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleFavorite(project.id, !project.membership.is_favorite)
        }}
        className="absolute top-3 right-3 text-muted-foreground hover:text-yellow-500 transition-colors"
      >
        <Star
          className={`h-4 w-4 ${project.membership.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`}
        />
      </button>

      <Link
        to="/p/$slug"
        params={{ slug: project.slug }}
        search={{ task: undefined, sprint: undefined }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{project.name}</h3>
            <p className="text-xs text-muted-foreground">/{project.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{project.task_count} tasks</span>
          <span>{project.member_count} members</span>
          <span className="capitalize">{project.membership.role}</span>
        </div>
      </Link>
    </div>
  )
}

function ProjectsPage() {
  const { data: projects, isLoading } = useMyProjects()
  const toggleFavorite = useToggleFavorite()
  const [createOpen, setCreateOpen] = useState(false)

  const favorites = projects?.filter((p) => p.membership.is_favorite) ?? []
  const others = projects?.filter((p) => !p.membership.is_favorite) ?? []

  const handleToggleFavorite = (projectId: string, isFavorite: boolean) => {
    toggleFavorite.mutate({ projectId, isFavorite })
  }

  return (
    <AppShell>
      <div className="h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your boards and workspaces
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !projects?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-4">No projects yet</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create your first project
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                Favorites
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favorites.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              {favorites.length > 0 && (
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  All Projects
                </h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {others.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <CreateProjectDialog onClose={() => setCreateOpen(false)} />
      )}
      </div>
    </AppShell>
  )
}
