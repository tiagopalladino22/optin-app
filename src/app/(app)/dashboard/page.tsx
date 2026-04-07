'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import SubscriberGrowthChart from '@/components/stats/SubscriberGrowthChart'
import { useData } from '@/lib/DataProvider'

type DateRange = '7d' | '14d' | '30d' | 'all' | 'custom'

export default function DashboardPage() {
  const { lists, campaigns, listsLoading, campaignsLoading, userEmail } = useData()
  const [avgOpenRate, setAvgOpenRate] = useState<number | null>(null)
  const [avgClickRate, setAvgClickRate] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const totalSubscribers = useMemo(
    () => lists.reduce((sum, l) => sum + (l.subscriber_count || 0), 0),
    [lists]
  )

  const sentCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'finished'),
    [campaigns]
  )

  // Filter campaigns by date range
  const filteredCampaigns = useMemo(() => {
    if (dateRange === 'all') return sentCampaigns

    const now = new Date()
    let fromDate: Date

    if (dateRange === 'custom') {
      if (!customFrom) return sentCampaigns
      fromDate = new Date(customFrom)
      const toDate = customTo ? new Date(customTo + 'T23:59:59') : now
      return sentCampaigns.filter((c) => {
        const d = new Date(c.started_at || c.created_at)
        return d >= fromDate && d <= toDate
      })
    }

    const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30
    fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return sentCampaigns.filter((c) => {
      const d = new Date(c.started_at || c.created_at)
      return d >= fromDate
    })
  }, [sentCampaigns, dateRange, customFrom, customTo])

  const recentCampaigns = useMemo(() => filteredCampaigns.slice(0, 5), [filteredCampaigns])

  const growthData = useMemo(() => {
    const sorted = [...lists].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    let cumulative = 0
    return sorted.map((list) => {
      cumulative += list.subscriber_count || 0
      return {
        date: new Date(list.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        subscribers: cumulative,
      }
    })
  }, [lists])

  const loadUniqueStats = useCallback(async () => {
    if (filteredCampaigns.length === 0) {
      setAvgOpenRate(0)
      setAvgClickRate(0)
      return
    }

    try {
      setAvgOpenRate(null)
      setAvgClickRate(null)

      // Fetch sent counts in parallel
      const sentCounts = await Promise.all(
        filteredCampaigns.map((c) =>
          fetch(`/api/listmonk/campaigns/${c.id}`)
            .then((r) => r.json())
            .then((d) => d.data?.sent || 0)
            .catch(() => 0)
        )
      )
      const totalSent = sentCounts.reduce((sum, s) => sum + s, 0)

      // Fetch unique stats
      const ids = filteredCampaigns.map((c) => c.id).join(',')
      const uniqueRes = await fetch(`/api/campaigns/unique-stats?ids=${ids}`)
      const uniqueData = await uniqueRes.json()

      let totalUniqueOpens = 0
      let totalUniqueClicks = 0
      if (uniqueData.data) {
        for (const campaign of filteredCampaigns) {
          const s = uniqueData.data[campaign.id]
          if (s) {
            totalUniqueOpens += s.uniqueOpens
            totalUniqueClicks += s.uniqueClicks
          }
        }
      }

      setAvgOpenRate(totalSent > 0 ? (totalUniqueOpens / totalSent) * 100 : 0)
      setAvgClickRate(totalUniqueOpens > 0 ? (totalUniqueClicks / totalUniqueOpens) * 100 : 0)
    } catch {
      setAvgOpenRate(0)
      setAvgClickRate(0)
    }
  }, [filteredCampaigns])

  // Reload stats when filtered campaigns change
  useEffect(() => {
    if (campaignsLoading) return
    loadUniqueStats()
  }, [campaignsLoading, loadUniqueStats])

  const loading = listsLoading || campaignsLoading

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border-custom p-5">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-surface rounded-xl border border-border-custom p-5">
          <div className="skeleton h-4 w-40 mb-4" />
          <div className="skeleton h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Hey {userEmail}</h1>
      </div>

      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['7d', '7 Days'],
          ['14d', '14 Days'],
          ['30d', '30 Days'],
          ['all', 'All Time'],
          ['custom', 'Custom'],
        ] as [DateRange, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setDateRange(value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dateRange === value
                ? 'bg-accent text-white'
                : 'bg-offwhite text-text-mid hover:bg-border-custom'
            }`}
          >
            {label}
          </button>
        ))}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2 py-1 border border-border-custom rounded-lg text-xs text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <span className="text-text-light text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2 py-1 border border-border-custom rounded-lg text-xs text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        )}
        <span className="text-xs text-text-light ml-2">
          {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Subscribers" value={totalSubscribers.toLocaleString()} />
        <StatCard label="Campaigns Sent" value={filteredCampaigns.length.toString()} />
        <StatCard
          label="Avg Open Rate"
          value={avgOpenRate !== null ? `${avgOpenRate.toFixed(1)}%` : null}
        />
        <StatCard
          label="Avg Click Rate"
          value={avgClickRate !== null ? `${avgClickRate.toFixed(1)}%` : null}
        />
      </div>

      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">Subscriber Growth</h2>
        <SubscriberGrowthChart data={growthData} />
      </div>

      <div>
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-3">Recent Campaigns</h2>
        {recentCampaigns.length === 0 ? (
          <p className="text-sm text-text-mid">No campaigns in this period.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-custom bg-offwhite">
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Subject</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentCampaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                    <td className="px-4 py-3 text-text-mid">{c.subject}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-text-light">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface rounded-xl border border-border-custom p-5">
      <p className="text-xs text-text-light uppercase tracking-wider mb-1">{label}</p>
      {value !== null ? (
        <p className="font-display text-3xl text-text-primary">{value}</p>
      ) : (
        <div className="skeleton h-8 w-16 mt-1" />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-text-mid',
    running: 'bg-accent-wash text-accent',
    scheduled: 'bg-amber-50 text-amber-700',
    paused: 'bg-orange-50 text-orange-700',
    cancelled: 'bg-red-50 text-red-600',
    finished: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${styles[status] || 'bg-gray-100 text-text-mid'}`}>
      {status}
    </span>
  )
}
