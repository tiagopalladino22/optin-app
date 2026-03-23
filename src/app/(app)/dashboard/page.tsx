'use client'

import { useEffect, useState, useMemo } from 'react'
import SubscriberGrowthChart from '@/components/stats/SubscriberGrowthChart'
import { useData } from '@/lib/DataProvider'

export default function DashboardPage() {
  const { lists, campaigns, listsLoading, campaignsLoading } = useData()
  const [avgOpenRate, setAvgOpenRate] = useState<number | null>(null)
  const [avgClickRate, setAvgClickRate] = useState<number | null>(null)

  const totalSubscribers = useMemo(
    () => lists.reduce((sum, l) => sum + (l.subscriber_count || 0), 0),
    [lists]
  )

  const sentCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'finished'),
    [campaigns]
  )

  const recentCampaigns = useMemo(() => campaigns.slice(0, 5), [campaigns])

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

  // Load unique stats in background after campaigns are available
  useEffect(() => {
    if (campaignsLoading || sentCampaigns.length === 0) return

    async function loadUniqueStats() {
      try {
        const recent = sentCampaigns.slice(0, 10)

        // Fetch sent counts in parallel
        const sentCounts = await Promise.all(
          recent.map((c) =>
            fetch(`/api/listmonk/campaigns/${c.id}`)
              .then((r) => r.json())
              .then((d) => d.data?.sent || 0)
              .catch(() => 0)
          )
        )
        const totalSent = sentCounts.reduce((sum, s) => sum + s, 0)

        // Fetch unique stats
        const ids = recent.map((c) => c.id).join(',')
        const uniqueRes = await fetch(`/api/campaigns/unique-stats?ids=${ids}`)
        const uniqueData = await uniqueRes.json()

        let totalUniqueOpens = 0
        let totalUniqueClicks = 0
        if (uniqueData.data) {
          for (const campaign of recent) {
            const s = uniqueData.data[campaign.id]
            if (s) {
              totalUniqueOpens += s.uniqueOpens
              totalUniqueClicks += s.uniqueClicks
            }
          }
        }

        setAvgOpenRate(totalSent > 0 ? (totalUniqueOpens / totalSent) * 100 : 0)
        setAvgClickRate(totalSent > 0 ? (totalUniqueClicks / totalSent) * 100 : 0)
      } catch {
        setAvgOpenRate(0)
        setAvgClickRate(0)
      }
    }

    loadUniqueStats()
  }, [campaignsLoading, sentCampaigns])

  const loading = listsLoading && campaignsLoading

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border-custom p-5">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <div className="skeleton h-4 w-40 mb-4" />
          <div className="skeleton h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Subscribers" value={totalSubscribers.toLocaleString()} />
        <StatCard label="Campaigns Sent" value={sentCampaigns.length.toString()} />
        <StatCard
          label="Avg Open Rate"
          value={avgOpenRate !== null ? `${avgOpenRate.toFixed(1)}%` : null}
        />
        <StatCard
          label="Avg Click Rate"
          value={avgClickRate !== null ? `${avgClickRate.toFixed(1)}%` : null}
        />
      </div>

      <div className="bg-white rounded-xl border border-border-custom p-5">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">Subscriber Growth</h2>
        <SubscriberGrowthChart data={growthData} />
      </div>

      <div>
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-3">Recent Campaigns</h2>
        {recentCampaigns.length === 0 ? (
          <p className="text-sm text-text-mid">No campaigns yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
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
    <div className="bg-white rounded-xl border border-border-custom p-5">
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
