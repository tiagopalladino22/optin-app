'use client'

import { useEffect, useState, useMemo } from 'react'
import CampaignStatsTable from '@/components/stats/CampaignStatsTable'
import RateChart from '@/components/stats/RateChart'
import SubscriberGrowthChart from '@/components/stats/SubscriberGrowthChart'
import { useData } from '@/lib/DataProvider'

export interface CampaignStats {
  id: number
  name: string
  subject: string
  status: string
  sent: number
  views: number
  clicks: number
  bounces: number
  uniqueOpens: number
  uniqueClicks: number
  started_at: string | null
  created_at: string
}

interface RateDataPoint {
  name: string
  openRate: number
  clickRate: number
}

export default function StatsPage() {
  const { lists, campaigns: allCampaigns, listsLoading, campaignsLoading } = useData()
  const [detailedCampaigns, setDetailedCampaigns] = useState<CampaignStats[]>([])
  const [loadingUniques, setLoadingUniques] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Build campaign stats from shared data (no individual fetches needed)
  const activeCampaigns = useMemo(() => {
    return allCampaigns
      .filter((c) => c.status === 'finished' || c.status === 'running')
      .map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        sent: c.sent || 0,
        views: c.views || 0,
        clicks: c.clicks || 0,
        bounces: c.bounces || 0,
        uniqueOpens: c.views || 0, // fallback until uniques load
        uniqueClicks: c.clicks || 0,
        started_at: c.started_at,
        created_at: c.created_at,
      } as CampaignStats))
      .sort(
        (a, b) =>
          new Date(b.started_at || b.created_at).getTime() -
          new Date(a.started_at || a.created_at).getTime()
      )
  }, [allCampaigns])

  // Set initial data from shared campaigns, then fetch uniques
  useEffect(() => {
    if (campaignsLoading) return
    setDetailedCampaigns(activeCampaigns)

    if (activeCampaigns.length > 0) {
      setLoadingUniques(true)
      const ids = activeCampaigns.map((c) => c.id).join(',')
      fetch(`/api/campaigns/unique-stats?ids=${ids}`)
        .then((r) => r.json())
        .then((uniqueData) => {
          if (uniqueData.data) {
            setDetailedCampaigns(
              activeCampaigns.map((c) => {
                const stats = uniqueData.data[c.id]
                return stats
                  ? { ...c, uniqueOpens: stats.uniqueOpens, uniqueClicks: stats.uniqueClicks }
                  : c
              })
            )
          }
        })
        .catch(() => {})
        .finally(() => setLoadingUniques(false))
    }
  }, [campaignsLoading, activeCampaigns])

  // Build rate chart data
  const rateData = useMemo<RateDataPoint[]>(() => {
    const chrono = [...detailedCampaigns].reverse().slice(-20)
    return chrono.map((c) => ({
      name: new Date(c.started_at || c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      openRate: parseFloat((c.sent > 0 ? ((c.uniqueOpens || c.views) / c.sent) * 100 : 0).toFixed(1)),
      clickRate: parseFloat(((c.uniqueOpens || c.views) > 0 ? ((c.uniqueClicks || c.clicks) / (c.uniqueOpens || c.views)) * 100 : 0).toFixed(1)),
    }))
  }, [detailedCampaigns])

  // Build growth data
  const growthData = useMemo(() => {
    const sorted = [...lists].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    let cumulative = 0
    return sorted.map((list) => {
      cumulative += list.subscriber_count || 0
      return {
        date: new Date(list.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subscribers: cumulative,
      }
    })
  }, [lists])

  const loading = listsLoading && campaignsLoading

  const exportCsv = () => {
    if (detailedCampaigns.length === 0) return
    setExporting(true)

    const headers = ['Campaign', 'Subject', 'Status', 'Sent', 'Delivered', 'Unique Opens', 'Total Opens', 'Open Rate', 'Unique Clicks', 'Total Clicks', 'CTR', 'Bounces', 'Date']
    const rows = detailedCampaigns.map((c) => {
      const delivered = c.sent - c.bounces
      const openRate = c.sent > 0 ? (((c.uniqueOpens || c.views) / c.sent) * 100).toFixed(1) : '0.0'
      const clickRate = (c.uniqueOpens || c.views) > 0 ? (((c.uniqueClicks || c.clicks) / (c.uniqueOpens || c.views)) * 100).toFixed(1) : '0.0'
      return [
        `"${c.name}"`,
        `"${c.subject}"`,
        c.status,
        c.sent,
        delivered,
        c.uniqueOpens || c.views,
        c.views,
        `${openRate}%`,
        c.uniqueClicks || c.clicks,
        c.clicks,
        `${clickRate}%`,
        c.bounces,
        new Date(c.started_at || c.created_at).toLocaleDateString(),
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-10 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border-custom p-4">
              <div className="skeleton h-3 w-16 mb-3" />
              <div className="skeleton h-7 w-14" />
            </div>
          ))}
        </div>
        <div className="bg-surface rounded-xl border border-border-custom p-5">
          <div className="skeleton h-4 w-56 mb-4" />
          <div className="skeleton h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  // Aggregates
  const totalSent = detailedCampaigns.reduce((s, c) => s + c.sent, 0)
  const totalUniqueOpens = detailedCampaigns.reduce((s, c) => s + (c.uniqueOpens || c.views), 0)
  const totalTotalViews = detailedCampaigns.reduce((s, c) => s + c.views, 0)
  const totalUniqueClicks = detailedCampaigns.reduce((s, c) => s + (c.uniqueClicks || c.clicks), 0)
  const totalTotalClicks = detailedCampaigns.reduce((s, c) => s + c.clicks, 0)
  const totalBounces = detailedCampaigns.reduce((s, c) => s + c.bounces, 0)
  const avgOpenRate = totalSent > 0 ? ((totalUniqueOpens / totalSent) * 100).toFixed(1) : '0.0'
  const avgClickRate = totalUniqueOpens > 0 ? ((totalUniqueClicks / totalUniqueOpens) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Stats & Reporting</h1>
        <button
          onClick={exportCsv}
          disabled={exporting || detailedCampaigns.length === 0}
          className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg disabled:opacity-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
        <SummaryCard label="Campaigns" value={detailedCampaigns.length.toString()} />
        <SummaryCard label="Total Sent" value={totalSent.toLocaleString()} />
        <SummaryCard label="Unique Opens" value={totalUniqueOpens.toLocaleString()} sub={`${totalTotalViews.toLocaleString()} total`} loading={loadingUniques} />
        <SummaryCard label="Avg Open Rate" value={`${avgOpenRate}%`} loading={loadingUniques} />
        <SummaryCard label="Unique Clicks" value={totalUniqueClicks.toLocaleString()} sub={`${totalTotalClicks.toLocaleString()} total`} loading={loadingUniques} />
        <SummaryCard label="Avg CTR" value={`${avgClickRate}%`} loading={loadingUniques} />
        <SummaryCard label="Bounces" value={totalBounces.toLocaleString()} />
      </div>

      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <RateChart data={rateData} metric="openRate" title="Open Rate" color="#25679e" />
      </div>

      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <RateChart data={rateData} metric="clickRate" title="Click-Through Rate" color="#e87c3e" />
      </div>

      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">Subscriber Growth</h2>
        <SubscriberGrowthChart data={growthData} />
      </div>

      <div>
        <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-3">Per-Campaign Stats</h2>
        <CampaignStatsTable campaigns={detailedCampaigns} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border-custom p-4">
      <p className="text-xs text-text-light uppercase tracking-wider mb-1">{label}</p>
      {loading ? (
        <div className="skeleton h-7 w-14 mt-1" />
      ) : (
        <p className="font-display text-3xl text-text-primary">{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-text-light mt-0.5">{sub}</p>}
    </div>
  )
}
