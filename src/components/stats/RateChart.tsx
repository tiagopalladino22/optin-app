'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface DataPoint {
  name: string
  openRate: number
  clickRate: number
}

interface Props {
  data: DataPoint[]
}

export default function RateChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-text-light">
        No campaign data to chart yet.
      </div>
    )
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd8" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={{ stroke: '#e0ddd8' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={{ stroke: '#e0ddd8' }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid #e0ddd8',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            formatter={(value) => [`${Number(value).toFixed(1)}%`]}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="openRate"
            name="Open Rate"
            stroke="#25679e"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="clickRate"
            name="Click Rate"
            stroke="#3a85c8"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
