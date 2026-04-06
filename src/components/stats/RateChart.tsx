'use client'

import {
  ComposedChart,
  Bar,
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
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd8" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={{ stroke: '#e0ddd8' }}
            angle={-35}
            textAnchor="end"
            height={60}
            interval={data.length > 15 ? Math.floor(data.length / 10) : 0}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#8a9aaa' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 12,
              border: '1px solid #e0ddd8',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              padding: '10px 14px',
              backgroundColor: '#fff',
            }}
            formatter={(value) => [
              `${Number(value).toFixed(1)}%`,
            ]}
            labelStyle={{ color: '#07111f', fontWeight: 600, marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
            iconType="circle"
          />
          <Bar
            yAxisId="left"
            dataKey="openRate"
            name="Open Rate"
            fill="#25679e"
            fillOpacity={0.15}
            stroke="#25679e"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            barSize={data.length > 15 ? 16 : 28}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="clickRate"
            name="CTR"
            stroke="#e87c3e"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#e87c3e', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#e87c3e', stroke: '#fff', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
