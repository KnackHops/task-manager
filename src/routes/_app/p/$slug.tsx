import { createFileRoute, Outlet, useNavigate, Link, type ErrorComponentProps } from '@tanstack/react-router'
import { useProject } from '@/hooks/useProjects'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/_app/p/$slug')({
  component: ProjectLayout,
  errorComponent: ProjectErrorComponent,
})

function ProjectLayout() {
  const { slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: project, isLoading, error } = useProject(slug)

  if (isLoading) {
    return (
      <AppShell projectSlug={slug}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-1 min-h-0 gap-4 overflow-hidden pb-4">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col} className="flex w-64 shrink-0 flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>
              {Array.from({ length: 3 - col % 2 }).map((_, card) => (
                <div key={card} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
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

function ProjectErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Project error</h2>
        <p className="text-sm text-muted-foreground mb-4">Something went wrong loading this project.</p>
        {import.meta.env.DEV && (
          <pre className="text-xs text-left bg-muted p-3 rounded-lg overflow-auto max-h-40 text-muted-foreground mb-4 max-w-md w-full">
            {error.message}
          </pre>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            to="/projects"
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Back to projects
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
