'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from '@/lib/ThemeProvider'

interface DataPoint {
  date: string
  subscribers: number
}

interface Props {
  data: DataPoint[]
}

export default function SubscriberGrowthChart({ data }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-text-light">
        No subscriber data to chart yet.
      </div>
    )
  }

  const tickColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const tooltipBg = isDark ? '#2c2c2e' : '#ffffff'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'
  const dotStroke = isDark ? '#1c1c1e' : '#ffffff'
  const color = '#25679e'

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.25 : 0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: tickColor, dy: 8 }}
            tickLine={false}
            axisLine={false}
            interval={data.length > 12 ? Math.floor(data.length / 8) : 0}
            height={35}
          />
          <YAxis
            tick={{ fontSize: 11, fill: tickColor, dx: -8 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
            width={45}
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
            formatter={(value) => [Number(value).toLocaleString(), 'Subscribers']}
            cursor={{ stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }}
          />
          <Area
            type="natural"
            dataKey="subscribers"
            stroke={color}
            strokeWidth={2}
            fill="url(#subGrad)"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: dotStroke, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
