import { createFileRoute } from '@tanstack/react-router'
import { ApiKeyManager } from '@/components/settings/ApiKeyManager'

export const Route = createFileRoute('/_app/settings')({
  component: UserSettingsPage,
})

function UserSettingsPage() {
  return (
    <div className="h-full overflow-auto p-6">
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
  )
}
