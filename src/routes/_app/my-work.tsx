import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { MyWorkView } from '@/components/my-work/MyWorkView'

export const Route = createFileRoute('/_app/my-work')({
  component: MyWorkPage,
})

function MyWorkPage() {
  return (
    <AppShell>
      <MyWorkView />
    </AppShell>
  )
}
