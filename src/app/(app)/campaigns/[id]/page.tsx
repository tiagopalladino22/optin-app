'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface CampaignDetail {
  id: number
  name: string
  subject: string
  from_email: string
  status: string
  type: string
  sent: number
  to_send: number
  views: number
  clicks: number
  bounces: number
  lists: { id: number; name: string }[]
  created_at: string
  started_at: string | null
}

interface UniqueStats {
  uniqueOpens: number
  uniqueClicks: number
}

export default function CampaignDetailPage() {
  const params = useParams()
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [uniqueStats, setUniqueStats] = useState<UniqueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchCampaign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function fetchCampaign() {
    try {
      const res = await fetch(`/api/listmonk/campaigns/${params.id}`)
      const data = await res.json()
      setCampaign(data.data)

      // Fetch unique stats if campaign has been sent
      if (data.data?.status === 'finished' || data.data?.status === 'running') {
        const statsRes = await fetch(`/api/campaigns/unique-stats?ids=${params.id}`)
        const statsData = await statsRes.json()
        if (statsData.data?.[params.id as string]) {
          setUniqueStats(statsData.data[params.id as string])
        }
      }
    } catch (err) {
      console.error('Failed to fetch campaign:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!confirm('Are you sure you want to start this campaign?')) return
    setSending(true)
    try {
      await fetch(`/api/listmonk/campaigns/${params.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      })
      await fetchCampaign()
    } catch (err) {
      console.error('Failed to send campaign:', err)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-48 w-full" />
      </div>
    )
  }

  if (!campaign) {
    return <p className="text-text-mid">Campaign not found.</p>
  }

  const totalViews = campaign.views || 0
  const totalClicks = campaign.clicks || 0
  const uniqueOpens = uniqueStats?.uniqueOpens ?? totalViews
  const uniqueClicks = uniqueStats?.uniqueClicks ?? totalClicks
  const uniqueOpenRate = campaign.sent > 0 ? ((uniqueOpens / campaign.sent) * 100).toFixed(1) : '0.0'
  const uniqueClickRate = campaign.sent > 0 ? ((uniqueClicks / campaign.sent) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/campaigns" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Campaigns
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{campaign.name}</h1>
          <p className="text-sm text-text-light mt-1">{campaign.subject}</p>
        </div>
        {campaign.status === 'draft' && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {sending ? 'Starting...' : 'Send Campaign'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Sent" value={campaign.sent?.toLocaleString() || '0'} />
        <StatCard
          label="Unique Opens"
          value={`${uniqueOpens.toLocaleString()} (${uniqueOpenRate}%)`}
          sub={`${totalViews.toLocaleString()} total views`}
        />
        <StatCard
          label="Unique Clicks"
          value={`${uniqueClicks.toLocaleString()} (${uniqueClickRate}%)`}
          sub={`${totalClicks.toLocaleString()} total clicks`}
        />
        <StatCard label="Bounces" value={campaign.bounces?.toLocaleString() || '0'} />
        <StatCard label="Bounce Rate" value={campaign.sent > 0 ? `${((campaign.bounces / campaign.sent) * 100).toFixed(1)}%` : '0.0%'} />
      </div>

      <div className="bg-white rounded-xl border border-border-custom p-5">
        <h2 className="text-sm font-medium text-text-mid mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-text-light">Status</dt>
            <dd className="font-medium text-navy capitalize">{campaign.status}</dd>
          </div>
          <div>
            <dt className="text-text-light">From</dt>
            <dd className="font-medium text-navy">{campaign.from_email}</dd>
          </div>
          <div>
            <dt className="text-text-light">Lists</dt>
            <dd className="font-medium text-navy">
              {campaign.lists?.map((l) => l.name).join(', ') || 'None'}
            </dd>
          </div>
          <div>
            <dt className="text-text-light">Created</dt>
            <dd className="font-medium text-navy">
              {new Date(campaign.created_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border-custom p-5">
      <p className="text-xs text-text-light uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-3xl text-navy">{value}</p>
      {sub && <p className="text-xs text-text-light mt-1">{sub}</p>}
    </div>
  )
}
