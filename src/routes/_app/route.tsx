import { createFileRoute, Outlet, Navigate, Link, type ErrorComponentProps } from '@tanstack/react-router'
import { useAuth } from '@/contexts/AuthContext'
import { AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  errorComponent: AppErrorComponent,
})

function AppLayout() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return <Outlet />
}

function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-md">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">An error occurred while loading this page.</p>
        {import.meta.env.DEV && (
          <pre className="text-xs text-left bg-muted p-3 rounded-lg overflow-auto max-h-40 text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
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
            Go to Projects
          </Link>
        </div>
      </div>
    </div>
  )
}
