import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useProject } from '@/hooks/useProjects'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { AppShell } from '@/components/layout/AppShell'

export const Route = createFileRoute('/_app/p/$slug')({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: project, isLoading, error } = useProject(slug)

  if (isLoading) {
    return (
      <AppShell projectSlug={slug}>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    )
  }

  if (error || !project) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-4">Project not found</p>
          <button
            onClick={() => navigate({ to: '/projects' })}
            className="text-sm text-primary hover:underline"
          >
            Back to projects
          </button>
        </div>
      </AppShell>
    )
  }

  return (
    <ProjectProvider project={project}>
      <AppShell projectSlug={slug}>
        <Outlet />
      </AppShell>
    </ProjectProvider>
  )
}
