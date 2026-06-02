import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  useMyTasks,
  useRunningSession,
  useStartTimer,
  useStopTimer,
  useSetTaskRank,
  timeKeys,
} from '@/hooks/useTimeTracking'
import { useUpdateTask } from '@/hooks/useTasks'
import { midpointRank } from '@/services/user-task-order'
import { TimeTotals } from './TimeTotals'
import { RunningBar } from './RunningBar'
import { MyTaskRow } from './MyTaskRow'
import { SessionLog } from './SessionLog'
import type { MyWorkTask } from '@/types/database'

export function MyWorkView() {
  const { user } = useAuth()
  const userId = user?.id
  const [tab, setTab] = useState<'board' | 'log'>('board')

  const { data: tasks } = useMyTasks(userId)
  const { data: running } = useRunningSession(userId)
  const start = useStartTimer(userId)
  const stop = useStopTimer(userId)
  const setRank = useSetTaskRank(userId)

  if (!userId) return null

  const active = (tasks ?? []).filter((t) => !t.is_done)
  const runningTaskId = running?.task_id ?? null

  function onDragEnd(result: DropResult) {
    if (!result.destination || !userId) return
    const toIndex = result.destination.index
    const ranks = active.map((t) => t.rank)
    const rank = midpointRank(ranks, toIndex)
    setRank.mutate({ taskId: result.draggableId, rank })
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">My Work</h2>
        <TimeTotals userId={userId} />
      </div>

      <RunningBar userId={userId} />

      <div className="flex gap-2 border-b border-border">
        {(['board', 'log'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t === 'board' ? 'Board' : 'Log'}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="my-work">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2 overflow-y-auto">
                {active.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps}>
                        <MyWorkRow
                          task={task}
                          userId={userId}
                          isRunning={runningTaskId === task.id}
                          onStart={(id) => start.mutate(id)}
                          onStop={() => stop.mutate()}
                          dragHandleProps={(p.dragHandleProps ?? undefined) as Record<string, unknown> | undefined}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {active.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No active tasks assigned to you.
                  </p>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="overflow-y-auto">
          <SessionLog filters={{ userId }} />
        </div>
      )}
    </div>
  )
}

function MyWorkRow({
  task,
  userId,
  isRunning,
  onStart,
  onStop,
  dragHandleProps,
}: {
  task: MyWorkTask
  userId: string
  isRunning: boolean
  onStart: (taskId: string) => void
  onStop: () => void
  dragHandleProps?: Record<string, unknown>
}) {
  const qc = useQueryClient()
  const update = useUpdateTask(task.project.id)
  return (
    <MyTaskRow
      task={task}
      isRunning={isRunning}
      onStart={onStart}
      onStop={onStop}
      onToggleComplete={(t) =>
        update.mutate(
          {
            taskId: t.id,
            input: { is_done: !t.is_done, done_at: !t.is_done ? new Date().toISOString() : null },
          },
          { onSuccess: () => qc.invalidateQueries({ queryKey: timeKeys.myTasks(userId) }) },
        )
      }
      dragHandleProps={dragHandleProps}
    />
  )
}
