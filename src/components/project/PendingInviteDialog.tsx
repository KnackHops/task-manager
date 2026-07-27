import { toast } from 'sonner'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useAcceptInvite, useDeclineInvite } from '@/hooks/useMembers'

interface PendingInviteDialogProps {
  open: boolean
  onClose: () => void
  onAccepted?: () => void
  membershipId: string
  projectName: string
}

export function PendingInviteDialog({
  open,
  onClose,
  onAccepted,
  membershipId,
  projectName,
}: PendingInviteDialogProps) {
  const acceptInvite = useAcceptInvite()
  const declineInvite = useDeclineInvite()
  const isPending = acceptInvite.isPending || declineInvite.isPending

  const handleAccept = () => {
    acceptInvite.mutate(membershipId, {
      onSuccess: () => {
        toast.success('Invite accepted')
        onClose()
        onAccepted?.()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleDecline = () => {
    declineInvite.mutate(membershipId, {
      onSuccess: () => {
        toast.success('Invite declined')
        onClose()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Pending Invitation</DialogTitle>
      </DialogHeader>
      <div className="text-sm text-muted-foreground mb-6">
        You've been invited to join <span className="font-medium text-foreground">{projectName}</span>. Accept to gain access, or decline to remove the invitation.
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDecline}
          disabled={isPending}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {declineInvite.isPending ? 'Declining...' : 'Decline'}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {acceptInvite.isPending ? 'Accepting...' : 'Accept'}
        </button>
      </div>
    </Dialog>
  )
}
