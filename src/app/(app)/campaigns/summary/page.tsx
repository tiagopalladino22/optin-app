'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface CampaignData {
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
  unsubs: number
  lists: { id: number; name: string }[]
  created_at: string
  started_at: string | null
}

export default function CampaignSummaryPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full" />}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryContent() {
  const searchParams = useSearchParams()
  const [campaigns, setCampaigns] = useState<CampaignData[]>([])
  const [loading, setLoading] = useState(true)

  const ids = useMemo(() => {
    const param = searchParams.get('ids')
    return param ? param.split(',').map(Number).filter(Boolean) : []
  }, [searchParams])

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false)
      return
    }

    async function fetchAll() {
      try {
        // Fetch campaign details in parallel
        const detailPromises = ids.map((id) =>
          fetch(`/api/listmonk/campaigns/${id}`)
            .then((r) => r.json())
            .then((d) => d.data)
            .catch(() => null)
        )
        const details = (await Promise.all(detailPromises)).filter(Boolean)

        // Fetch unique stats in one batch
        const uniqueRes = await fetch(`/api/campaigns/unique-stats?ids=${ids.join(',')}`)
        const uniqueData = await uniqueRes.json()
        const uniqueMap = uniqueData.data || {}

        const merged: CampaignData[] = details.map((c: CampaignData) => ({
          id: c.id,
          name: c.name,
          subject: c.subject,
          status: c.status,
          sent: c.sent || 0,
          views: c.views || 0,
          clicks: c.clicks || 0,
          bounces: c.bounces || 0,
          uniqueOpens: uniqueMap[c.id]?.uniqueOpens ?? c.views ?? 0,
          uniqueClicks: uniqueMap[c.id]?.uniqueClicks ?? c.clicks ?? 0,
          unsubs: uniqueMap[c.id]?.unsubs ?? 0,
          lists: c.lists || [],
          created_at: c.created_at,
          started_at: c.started_at,
        }))

        setCampaigns(merged)
      } catch (err) {
        console.error('Failed to fetch campaigns:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [ids])

  // Aggregates
  const totals = useMemo(() => {
    const t = {
      sent: 0,
      views: 0,
      clicks: 0,
      bounces: 0,
      uniqueOpens: 0,
      uniqueClicks: 0,
      unsubs: 0,
    }
    for (const c of campaigns) {
      t.sent += c.sent
      t.views += c.views
      t.clicks += c.clicks
      t.bounces += c.bounces
      t.uniqueOpens += c.uniqueOpens
      t.uniqueClicks += c.uniqueClicks
      t.unsubs += c.unsubs
    }
    return t
  }, [campaigns])

  const avgOpenRate = totals.sent > 0 ? ((totals.uniqueOpens / totals.sent) * 100).toFixed(1) : '0.0'
  const avgClickRate = totals.uniqueOpens > 0 ? ((totals.uniqueClicks / totals.uniqueOpens) * 100).toFixed(1) : '0.0'
  const bounceRate = totals.sent > 0 ? ((totals.bounces / totals.sent) * 100).toFixed(1) : '0.0'
  const unsubRate = totals.sent > 0 ? ((totals.unsubs / totals.sent) * 100).toFixed(2) : '0.00'

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-3 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border-custom p-4">
              <div className="skeleton h-3 w-16 mb-3" />
              <div className="skeleton h-7 w-14" />
            </div>
          ))}
        </div>
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/campaigns" className="text-sm text-text-light hover:text-text-mid block">
          &larr; Back to Campaigns
        </Link>
        <p className="text-text-mid">No campaigns selected.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/campaigns" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Campaigns
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">
            Campaign Summary
          </h1>
          <p className="text-sm text-text-light mt-1">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} selected
          </p>
        </div>
        <button
          onClick={() => {
            const headers = ['Campaign', 'Subject', 'Sent', 'Unique Opens', 'Open Rate', 'Total Views', 'Unique Clicks', 'CTR', 'Total Clicks', 'Unsubs', 'Unsub Rate', 'Bounces', 'Bounce Rate', 'Lists', 'Date']
            const rows = campaigns.map((c) => [
              `"${c.name}"`,
              `"${c.subject}"`,
              c.sent,
              c.uniqueOpens,
              `${c.sent > 0 ? ((c.uniqueOpens / c.sent) * 100).toFixed(1) : '0.0'}%`,
              c.views,
              c.uniqueClicks,
              `${c.uniqueOpens > 0 ? ((c.uniqueClicks / c.uniqueOpens) * 100).toFixed(1) : '0.0'}%`,
              c.clicks,
              c.unsubs,
              `${c.sent > 0 ? ((c.unsubs / c.sent) * 100).toFixed(2) : '0.00'}%`,
              c.bounces,
              `${c.sent > 0 ? ((c.bounces / c.sent) * 100).toFixed(1) : '0.0'}%`,
              `"${c.lists.map((l) => l.name).join('; ')}"`,
              new Date(c.started_at || c.created_at).toLocaleDateString(),
            ].join(','))

            // Add totals row
            rows.push([
              '"TOTAL"', '""',
              totals.sent, totals.uniqueOpens, `${avgOpenRate}%`, totals.views,
              totals.uniqueClicks, `${avgClickRate}%`, totals.clicks,
              totals.unsubs, `${unsubRate}%`,
              totals.bounces, `${bounceRate}%`, '""', '""',
            ].join(','))

            const csv = [headers.join(','), ...rows].join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `campaign-summary-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-white rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <SummaryCard label="Total Sent" value={totals.sent.toLocaleString()} />
        <SummaryCard
          label="Unique Opens"
          value={totals.uniqueOpens.toLocaleString()}
          sub={`${totals.views.toLocaleString()} total`}
        />
        <SummaryCard label="Avg Open Rate" value={`${avgOpenRate}%`} />
        <SummaryCard
          label="Unique Clicks"
          value={totals.uniqueClicks.toLocaleString()}
          sub={`${totals.clicks.toLocaleString()} total`}
        />
        <SummaryCard label="Avg CTR" value={`${avgClickRate}%`} />
        <SummaryCard label="Unsubs" value={totals.unsubs.toLocaleString()} sub={`${unsubRate}%`} />
        <SummaryCard label="Bounces" value={totals.bounces.toLocaleString()} />
        <SummaryCard label="Bounce Rate" value={`${bounceRate}%`} />
      </div>

      {/* Per-campaign breakdown */}
      <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
        <div className="px-5 py-4 border-b border-border-custom">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase">Per-Campaign Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                <th className="text-left px-4 py-3 font-medium">Campaign</th>
                <th className="text-right px-4 py-3 font-medium">Sent</th>
                <th className="text-right px-4 py-3 font-medium">Unique Opens</th>
                <th className="text-right px-4 py-3 font-medium">Open %</th>
                <th className="text-right px-4 py-3 font-medium">Unique Clicks</th>
                <th className="text-right px-4 py-3 font-medium">CTR</th>
                <th className="text-right px-4 py-3 font-medium">Unsubs</th>
                <th className="text-right px-4 py-3 font-medium">Bounces</th>
                <th className="text-left px-4 py-3 font-medium">Lists</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const openRate = c.sent > 0 ? ((c.uniqueOpens / c.sent) * 100).toFixed(1) : '0.0'
                const clickRate = c.uniqueOpens > 0 ? ((c.uniqueClicks / c.uniqueOpens) * 100).toFixed(1) : '0.0'
                return (
                  <tr key={c.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/campaigns/${c.id}?queue=${ids.join(',')}`}
                        className="text-accent hover:text-accent-bright font-medium"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-text-light mt-0.5">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-navy tabular-nums">{c.sent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-navy tabular-nums">{c.uniqueOpens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-accent font-medium tabular-nums">{openRate}%</td>
                    <td className="px-4 py-3 text-right text-navy tabular-nums">{c.uniqueClicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-accent font-medium tabular-nums">{clickRate}%</td>
                    <td className="px-4 py-3 text-right text-navy tabular-nums">{c.unsubs.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-navy tabular-nums">{c.bounces.toLocaleString()}</td>
                    <td className="px-4 py-3 text-text-light text-xs">
                      {c.lists.map((l) => l.name).join(', ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-offwhite border-t border-border-custom font-medium">
                <td className="px-4 py-3 text-navy">TOTAL</td>
                <td className="px-4 py-3 text-right text-navy tabular-nums">{totals.sent.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-navy tabular-nums">{totals.uniqueOpens.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-accent tabular-nums">{avgOpenRate}%</td>
                <td className="px-4 py-3 text-right text-navy tabular-nums">{totals.uniqueClicks.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-accent tabular-nums">{avgClickRate}%</td>
                <td className="px-4 py-3 text-right text-navy tabular-nums">{totals.unsubs.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-navy tabular-nums">{totals.bounces.toLocaleString()}</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border-custom p-4">
      <p className="text-xs text-text-light uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-3xl text-navy">{value}</p>
      {sub && <p className="text-xs text-text-light mt-0.5">{sub}</p>}
    </div>
  )
}
