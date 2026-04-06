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
      <div className="h-48 flex items-center justify-center text-sm text-text-light">
        No campaign data to chart yet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-text-light uppercase tracking-wider mb-2 font-medium">Open Rate</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <defs>
                <linearGradient id="openGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#25679e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#25679e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd8" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#8a9aaa' }}
                tickLine={false}
                axisLine={false}
                interval={data.length > 10 ? Math.floor(data.length / 6) : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#8a9aaa' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e0ddd8',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  padding: '6px 10px',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Open Rate']}
              />
              <Area
                type="monotone"
                dataKey="openRate"
                stroke="#25679e"
                strokeWidth={2}
                fill="url(#openGrad)"
                dot={{ r: 2.5, fill: '#25679e', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#25679e', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-xs text-text-light uppercase tracking-wider mb-2 font-medium">Click-Through Rate</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <defs>
                <linearGradient id="ctrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e87c3e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#e87c3e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd8" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#8a9aaa' }}
                tickLine={false}
                axisLine={false}
                interval={data.length > 10 ? Math.floor(data.length / 6) : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#8a9aaa' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e0ddd8',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  padding: '6px 10px',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'CTR']}
              />
              <Area
                type="monotone"
                dataKey="clickRate"
                stroke="#e87c3e"
                strokeWidth={2}
                fill="url(#ctrGrad)"
                dot={{ r: 2.5, fill: '#e87c3e', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#e87c3e', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
