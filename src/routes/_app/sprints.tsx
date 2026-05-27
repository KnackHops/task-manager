import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Timer } from 'lucide-react'

export const Route = createFileRoute('/_app/sprints')({
  component: SprintsPage,
})

function SprintsPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Timer className="h-12 w-12 text-primary/40" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Sprints</h2>
          <p className="text-sm mt-1">Sprint management will go here</p>
        </div>
      </div>
    </AppShell>
  )
}
