'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { useTheme } from '@/lib/ThemeProvider'

interface DataPoint {
  name: string
  openRate: number
  clickRate: number
}

interface Props {
  data: DataPoint[]
  metric?: 'openRate' | 'clickRate'
  title?: string
  color?: string
}

export default function RateChart({ data, metric = 'openRate', title = 'Open Rate', color = '#25679e' }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-text-light">
        No campaign data to chart yet.
      </div>
    )
  }

  const tickColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const tooltipBg = isDark ? '#2c2c2e' : '#ffffff'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'
  const dotStroke = isDark ? '#1c1c1e' : '#ffffff'
  const gradientId = `grad-${metric}`

  const avg = data.reduce((s, d) => s + d[metric], 0) / data.length
  const max = Math.max(...data.map((d) => d[metric]))
  const min = Math.min(...data.map((d) => d[metric]))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-4">
          <span className="text-xs text-text-light">
            Min <span className="font-medium text-text-mid">{min.toFixed(1)}%</span>
          </span>
          <span className="text-xs text-text-light">
            Avg <span className="font-semibold" style={{ color }}>{avg.toFixed(1)}%</span>
          </span>
          <span className="text-xs text-text-light">
            Max <span className="font-medium text-text-mid">{max.toFixed(1)}%</span>
          </span>
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.3 : 0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: tickColor, dy: 8 }}
              tickLine={false}
              axisLine={false}
              interval={data.length > 10 ? Math.floor(data.length / 6) : 0}
              height={35}
            />
            <YAxis
              tick={{ fontSize: 10, fill: tickColor, dx: -8 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              width={50}
              domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax * 1.2), dataMax + 2)]}
            />
            <ReferenceLine
              y={avg}
              stroke={color}
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 10,
                border: `1px solid ${tooltipBorder}`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                padding: '8px 12px',
                backgroundColor: tooltipBg,
                color: isDark ? '#f5f5f7' : '#1d1d1f',
              }}
              itemStyle={{ color: isDark ? '#f5f5f7' : '#1d1d1f' }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`]}
              cursor={{ stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: dotStroke, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
