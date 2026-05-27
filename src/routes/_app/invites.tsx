import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Mail, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { usePendingInvites } from '@/hooks/useInvites'
import { useAcceptInvite, useDeclineInvite } from '@/hooks/useMembers'
import { formatDistanceToNow } from 'date-fns'

export const Route = createFileRoute('/_app/invites')({
  component: InvitesPage,
})

function InvitesPage() {
  const { user } = useAuth()
  const { data: invites, isLoading } = usePendingInvites(user?.id)
  const acceptInvite = useAcceptInvite()
  const declineInvite = useDeclineInvite()
  const navigate = useNavigate()

  const handleAccept = (memberId: string, projectSlug: string) => {
    acceptInvite.mutate(memberId, {
      onSuccess: () => {
        toast.success('Invite accepted')
        navigate({ to: '/p/$slug', params: { slug: projectSlug }, search: { task: undefined, sprint: undefined } })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleDecline = (memberId: string) => {
    declineInvite.mutate(memberId, {
      onSuccess: () => toast.success('Invite declined'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Pending Invites</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project invitations waiting for your response
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : !invites?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Mail className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No pending invites</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
                  {invite.project.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">
                    {invite.project.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {invite.inviter && (
                      <span className="flex items-center gap-1">
                        <Avatar
                          name={invite.inviter.full_name}
                          url={invite.inviter.avatar_url}
                          size="sm"
                        />
                        Invited by {invite.inviter.full_name}
                      </span>
                    )}
                    <span>
                      {formatDistanceToNow(new Date(invite.joined_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(invite.id, invite.project.slug)}
                    disabled={acceptInvite.isPending}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(invite.id)}
                    disabled={declineInvite.isPending}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
