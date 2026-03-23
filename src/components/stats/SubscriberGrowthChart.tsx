'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  date: string
  subscribers: number
}

interface Props {
  data: DataPoint[]
}

export default function SubscriberGrowthChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-text-light">
        No subscriber data to chart yet.
      </div>
    )
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd8" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={{ stroke: '#e0ddd8' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={{ stroke: '#e0ddd8' }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid #e0ddd8',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            formatter={(value) => [Number(value).toLocaleString(), 'Subscribers']}
          />
          <Area
            type="monotone"
            dataKey="subscribers"
            stroke="#25679e"
            fill="#25679e"
            fillOpacity={0.1}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
