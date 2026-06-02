import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useMyProjects } from '@/hooks/useProjects'
import { RunningBar } from './RunningBar'
import { SessionLog } from './SessionLog'

/**
 * Cross-project time log — the one place where all sessions meet. Defaults to the
 * current user's entries across every project; filters narrow by project and can
 * widen to the whole team.
 */
export function TimeLogsView() {
  const { user } = useAuth()
  const userId = user?.id
  const { data: projects } = useMyProjects()
  const [projectId, setProjectId] = useState('') // '' = all projects
  const [mineOnly, setMineOnly] = useState(true)

  if (!userId) return null

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Time Logs</h2>

      <RunningBar userId={userId} />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="accent-primary"
          />
          Only my time
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionLog
          filters={{
            userId: mineOnly ? userId : undefined,
            projectId: projectId || undefined,
          }}
        />
      </div>
    </div>
  )
}
