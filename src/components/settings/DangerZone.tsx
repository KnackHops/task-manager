import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { LogOut, ArrowRightLeft, Trash2, AlertTriangle } from 'lucide-react'
import { useLeaveProject, useTransferOwnership } from '@/hooks/useMembers'
import { useDeleteProject } from '@/hooks/useProjects'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ProjectMemberWithProfile } from '@/types/database'

interface DangerZoneProps {
  projectId: string
  projectName: string
  isOwner: boolean
  activeMembers: ProjectMemberWithProfile[]
}

export function DangerZone({ projectId, projectName, isOwner, activeMembers }: DangerZoneProps) {
  const leave = useLeaveProject(projectId)
  const transfer = useTransferOwnership(projectId)
  const deleteProject = useDeleteProject()
  const navigate = useNavigate()

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [transferTarget, setTransferTarget] = useState<ProjectMemberWithProfile | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const activeNonOwners = activeMembers.filter((m) => m.role !== 'owner')

  const handleLeave = () => {
    leave.mutate(undefined, {
      onSuccess: () => {
        toast.success('Left project')
        navigate({ to: '/projects' })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleTransfer = () => {
    if (!transferTarget) return
    transfer.mutate(transferTarget.user_id, {
      onSuccess: () => {
        toast.success(`Ownership transferred to ${transferTarget.profile.full_name}`)
        setTransferTarget(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleDelete = () => {
    deleteProject.mutate(projectId, {
      onSuccess: () => {
        toast.success('Project deleted')
        navigate({ to: '/projects' })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="rounded-lg border border-destructive/30 p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
      </div>

      <div className="space-y-4">
        {/* Transfer Ownership — owner only */}
        {isOwner && activeNonOwners.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">Transfer Ownership</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Transfer this project to another member. You will become a regular member.
            </p>
            <div className="flex flex-wrap gap-2">
              {activeNonOwners.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setTransferTarget(m)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Avatar name={m.profile.full_name} url={m.profile.avatar_url} size="sm" />
                  {m.profile.full_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Delete Project — owner only */}
        {isOwner && (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Delete Project</h4>
              <p className="text-xs text-muted-foreground">
                Permanently delete this project and all its data.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}

        {/* Leave Project — non-owners only */}
        {!isOwner && (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Leave Project</h4>
              <p className="text-xs text-muted-foreground">
                You will lose access to this project.
              </p>
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Leave
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        title="Leave Project"
        description="You will lose access to this project. This cannot be undone."
        confirmLabel="Leave"
        isPending={leave.isPending}
      />

      <ConfirmDialog
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        onConfirm={handleTransfer}
        title="Transfer Ownership"
        description={`Transfer ownership to ${transferTarget?.profile.full_name}? You will become a regular member.`}
        confirmLabel="Transfer"
        confirmVariant="default"
        isPending={transfer.isPending}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Project"
        description={`Permanently delete "${projectName}" and all its tasks, columns, and data? All members will be notified. This cannot be undone.`}
        confirmLabel="Delete"
        isPending={deleteProject.isPending}
      />
    </div>
  )
}
