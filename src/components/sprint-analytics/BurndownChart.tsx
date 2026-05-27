import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { BurndownPoint } from '@/services/sprint-analytics'

interface BurndownChartProps {
  data: BurndownPoint[]
}

const IDEAL_COLOR = '#64748b' // slate-500 — visible on dark bg
const ACTUAL_COLOR = '#3b82f6' // blue-500

export function BurndownChart({ data }: BurndownChartProps) {
  const [mode, setMode] = useState<'tasks' | 'points'>('tasks')

  const hasPoints = data.some((d) => d.remainingPoints > 0 || d.idealPoints > 0)

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Burndown Chart
        </h3>
        {hasPoints && (
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setMode('tasks')}
              className={`px-3 py-1 transition-colors ${
                mode === 'tasks'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setMode('points')}
              className={`px-3 py-1 transition-colors ${
                mode === 'points'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Points
            </button>
          </div>
        )}
      </div>

      {/* Custom legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ backgroundColor: IDEAL_COLOR, borderStyle: 'dashed' }}
          />
          <span className="text-muted-foreground">Ideal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: ACTUAL_COLOR }}
          />
          <span className="text-muted-foreground">Actual</span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                fontSize: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey={
                mode === 'tasks' ? 'idealTasks' : 'idealPoints'
              }
              name="Ideal"
              stroke={IDEAL_COLOR}
              strokeDasharray="5 5"
              dot={false}
              strokeWidth={1.5}
            />
            <Line
              type="monotone"
              dataKey={
                mode === 'tasks' ? 'remainingTasks' : 'remainingPoints'
              }
              name="Actual"
              stroke={ACTUAL_COLOR}
              dot={{ r: 3, fill: ACTUAL_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: ACTUAL_COLOR }}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
