import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts'
import type { VelocityEntry } from '@/services/sprint-analytics'

interface VelocityChartProps {
  data: VelocityEntry[]
}

const BAR_COLOR = '#3b82f6' // blue-500
const AVG_COLOR = '#f59e0b' // amber-500 — distinct from bars

export function VelocityChart({ data }: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Velocity
        </h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          No completed sprints yet
        </p>
      </div>
    )
  }

  // Compute rolling average
  const chartData = data.map((entry, i) => {
    const window = data.slice(Math.max(0, i - 2), i + 1)
    const avg =
      window.reduce((s, e) => s + e.completedPoints, 0) / window.length
    return {
      name: entry.sprintName,
      points: entry.completedPoints,
      tasks: entry.completedTasks,
      average: Math.round(avg * 10) / 10,
    }
  })

  const hasPoints = chartData.some((d) => d.points > 0)
  const showAvg = hasPoints && data.length >= 3

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Velocity</h3>

      {/* Custom legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: BAR_COLOR }}
          />
          <span className="text-muted-foreground">
            {hasPoints ? 'Points' : 'Tasks'}
          </span>
        </div>
        {showAvg && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: AVG_COLOR }}
            />
            <span className="text-muted-foreground">Avg (3-sprint)</span>
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="name"
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
            {hasPoints ? (
              <>
                <Bar
                  dataKey="points"
                  name="Points"
                  fill={BAR_COLOR}
                  radius={[4, 4, 0, 0]}
                />
                {showAvg && (
                  <Line
                    type="monotone"
                    dataKey="average"
                    name="Avg (3-sprint)"
                    stroke={AVG_COLOR}
                    dot={{ r: 3, fill: AVG_COLOR, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: AVG_COLOR }}
                    strokeWidth={2}
                  />
                )}
              </>
            ) : (
              <Bar
                dataKey="tasks"
                name="Tasks"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
