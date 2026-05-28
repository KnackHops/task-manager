import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ApiKeyManager } from '@/components/settings/ApiKeyManager'

export const Route = createFileRoute('/_app/settings')({
  component: UserSettingsPage,
})

function UserSettingsPage() {
  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and integrations
          </p>
        </div>

        <div className="space-y-8 max-w-2xl">
          <ApiKeyManager />
        </div>
      </div>
    </AppShell>
  )
}
