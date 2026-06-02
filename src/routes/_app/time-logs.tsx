import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { TimeLogsView } from '@/components/my-work/TimeLogsView'

export const Route = createFileRoute('/_app/time-logs')({
  component: TimeLogsPage,
})

function TimeLogsPage() {
  return (
    <AppShell>
      <TimeLogsView />
    </AppShell>
  )
}
