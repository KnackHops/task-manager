import { useState } from 'react'
import { createFileRoute, Outlet, useNavigate, Link, type ErrorComponentProps } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useProject, useReactivateProject, useDeleteProject } from '@/hooks/useProjects'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'

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
        <div className="flex flex-1 min-h-0 flex-col gap-3 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
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
        {project.deactivated_at ? <DeactivatedBanner slug={slug} project={project} /> : <Outlet />}
      </AppShell>
    </ProjectProvider>
  )
}

function DeactivatedBanner({ slug, project }: { slug: string; project: { id: string; name: string; deactivated_at: string | null } }) {
  const navigate = useNavigate()
  const reactivate = useReactivateProject(slug)
  const deleteProject = useDeleteProject()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleReactivate = () => {
    reactivate.mutate(project.id, {
      onSuccess: () => toast.success('Project reactivated'),
      onError: (err) => toast.error(err.message),
    })
  }

  const handleDelete = () => {
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success('Project permanently deleted')
        navigate({ to: '/projects' })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <>
      <div className="mx-auto max-w-lg py-16">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500 mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Project Deactivated</h2>
          <p className="text-sm text-muted-foreground mb-4">
            "{project.name}" is deactivated. Reactivate to restore access, or permanently delete.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReactivate}
              disabled={reactivate.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {reactivate.isPending ? 'Reactivating...' : 'Reactivate'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Permanently Delete Project"
        description={`Permanently delete "${project.name}" and all its tasks, columns, and data? This cannot be undone.`}
        confirmLabel="Delete Forever"
        isPending={deleteProject.isPending}
      />
    </>
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
