import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Shield, ShieldCheck, Clock } from 'lucide-react'
import {
  useMembers,
  useInviteMember,
  useUpdatePermissions,
  useRemoveMember,
} from '@/hooks/useMembers'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { MemberPermissions, ProjectMemberWithProfile } from '@/types/database'

interface MemberManagerProps {
  projectId: string
  isOwner: boolean
  canManageMembers: boolean
}

const PERMISSION_LABELS: { key: keyof MemberPermissions; label: string }[] = [
  { key: 'can_create_task', label: 'Create tasks' },
  { key: 'can_edit_task', label: 'Edit tasks' },
  { key: 'can_delete_task', label: 'Delete tasks' },
  { key: 'can_archive_task', label: 'Archive tasks' },
  { key: 'can_manage_columns', label: 'Manage columns & tags' },
  { key: 'can_manage_members', label: 'Manage members' },
  { key: 'can_manage_sprints', label: 'Manage sprints' },
]

export function MemberManager({ projectId, isOwner, canManageMembers }: MemberManagerProps) {
  const { data: members } = useMembers(projectId, ['active', 'pending'])
  const inviteMember = useInviteMember(projectId)
  const updatePermissions = useUpdatePermissions(projectId)
  const removeMember = useRemoveMember(projectId)

  const [inviteEmail, setInviteEmail] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ProjectMemberWithProfile | null>(null)

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    inviteMember.mutate(
      { email: inviteEmail.trim() },
      {
        onSuccess: () => {
          toast.success('Invite sent')
          setInviteEmail('')
          setShowInvite(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const handleTogglePermission = (
    memberId: string,
    key: keyof MemberPermissions,
    currentValue: boolean
  ) => {
    updatePermissions.mutate(
      { memberId, permissions: { [key]: !currentValue } },
      { onError: (err) => toast.error(err.message) }
    )
  }

  const handleRemove = () => {
    if (!removeTarget) return
    removeMember.mutate(removeTarget.id, {
      onSuccess: () => {
        toast.success('Member removed')
        setRemoveTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Members</h3>
        {isOwner && canManageMembers && !showInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Invite Member
          </button>
        )}
      </div>

      {showInvite && (
        <form
          onSubmit={handleInvite}
          className="flex items-center gap-2 mb-3 rounded-lg border border-primary/50 px-3 py-2"
        >
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            type="email"
            placeholder="user@example.com"
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={inviteMember.isPending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {inviteMember.isPending ? '...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      )}

      <div className="space-y-2">
        {members?.map((member) => (
          <div
            key={member.id}
            className="rounded-lg border border-border px-3 py-3"
          >
            <div className="flex items-center gap-3 mb-2">
              <Avatar
                name={member.profile.full_name}
                url={member.profile.avatar_url}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate capitalize">
                    {member.profile.full_name}
                  </span>
                  {member.status === 'pending' ? (
                    <span className="flex items-center gap-1 shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
                      <Clock className="h-3 w-3" />
                      Pending
                    </span>
                  ) : member.role === 'owner' ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {member.profile.email}
                </p>
              </div>
              {isOwner && canManageMembers && member.role !== 'owner' && (
                <button
                  onClick={() => setRemoveTarget(member)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {member.role !== 'owner' && isOwner && canManageMembers && member.status === 'active' && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() =>
                      handleTogglePermission(
                        member.id,
                        key,
                        member[key] as boolean
                      )
                    }
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      member[key]
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {member.role === 'owner' && (
              <p className="text-xs text-primary mt-1">
                Owner — full access
              </p>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove Member"
        description={`Remove ${removeTarget?.profile.full_name} from this project?`}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
      />
    </div>
  )
}
