import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Copy, Check, Key } from 'lucide-react'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys'
import { MCP_URL } from '@/lib/constants'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ApiKey } from '@/services/api-keys'

function formatDate(date: string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

export function ApiKeyManager() {
  const { data: keys } = useApiKeys()
  const createKey = useCreateApiKey()
  const revokeKey = useRevokeApiKey()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
  const [configCopied, setConfigCopied] = useState(false)

  const handleCreate = () => {
    if (!newName.trim()) return
    createKey.mutate(newName.trim(), {
      onSuccess: (key) => {
        setCreatedKey(key)
        setNewName('')
        setAdding(false)
        toast.success('API key created')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleCopy = async () => {
    if (!createdKey) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(createdKey)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = createdKey
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy — select and copy manually')
    }
  }

  const handleRevoke = () => {
    if (!revokeTarget) return
    revokeKey.mutate(revokeTarget.id, {
      onSuccess: () => {
        toast.success('API key revoked')
        setRevokeTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keys for MCP server authentication
          </p>
        </div>
        {!adding && !createdKey && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Key
          </button>
        )}
      </div>

      {/* Created key display — shown once */}
      {createdKey && (
        <div className="rounded-lg border border-primary/50 bg-primary/5 p-3 mb-3 space-y-2">
          <p className="text-xs font-medium text-foreground">
            Copy your API key now. It won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs font-mono text-foreground select-all break-all">
              {createdKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-input p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Done
          </button>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="rounded-lg border border-primary/50 px-3 py-2 mb-3">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewName('')
                }
              }}
              placeholder="Key name (e.g. Claude Code)"
              autoFocus
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={handleCreate}
              disabled={createKey.isPending || !newName.trim()}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createKey.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setAdding(false)
                setNewName('')
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Key list */}
      <div className="space-y-1">
        {keys?.map((key) => (
          <div
            key={key.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {key.name}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {key.key_prefix}...
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Created {formatDate(key.created_at)}</span>
                {key.last_used_at && (
                  <span>Last used {formatDate(key.last_used_at)}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setRevokeTarget(key)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {keys?.length === 0 && !adding && !createdKey && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
            <Key className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No API keys yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a key to connect MCP clients
            </p>
          </div>
        )}
      </div>

      {/* Setup instructions */}
      <div className="rounded-lg border border-border bg-muted/50 p-3 mt-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">MCP Client Setup</p>
          <button
            onClick={async () => {
              const config = `"task-manager": {\n  "type": "streamableHttp",\n  "url": "${MCP_URL}",\n  "headers": {\n    "Authorization": "Bearer [API KEY]"\n  }\n}`
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(config)
                } else {
                  const textarea = document.createElement('textarea')
                  textarea.value = config
                  textarea.style.position = 'fixed'
                  textarea.style.opacity = '0'
                  document.body.appendChild(textarea)
                  textarea.select()
                  document.execCommand('copy')
                  document.body.removeChild(textarea)
                }
                setConfigCopied(true)
                toast.success('Copied to clipboard')
                setTimeout(() => setConfigCopied(false), 2000)
              } catch {
                toast.error('Failed to copy')
              }
            }}
            className="shrink-0 rounded-md border border-input p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {configCopied ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Add to your MCP config (replace key with your own):
        </p>
        <code className="block rounded bg-muted px-2 py-1.5 text-xs font-mono text-foreground whitespace-pre break-all">
{`"task-manager": {
  "type": "streamableHttp",
  "url": "${MCP_URL}",
  "headers": {
    "Authorization": "Bearer [API KEY]"
  }
}`}
        </code>
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke API Key"
        description={`Revoke "${revokeTarget?.name}"? Any MCP clients using this key will stop working.`}
        confirmLabel="Revoke"
        isPending={revokeKey.isPending}
      />
    </div>
  )
}
