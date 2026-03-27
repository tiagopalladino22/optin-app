'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [uniqueStats, setUniqueStats] = useState<UniqueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Queue navigation
  const queueIds = useMemo(() => {
    const q = searchParams.get('queue')
    return q ? q.split(',').map(Number).filter(Boolean) : []
  }, [searchParams])

  const currentId = Number(params.id)
  const currentIndex = queueIds.indexOf(currentId)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < queueIds.length - 1
  const queuePosition = currentIndex >= 0 ? `${currentIndex + 1} of ${queueIds.length}` : null

  const navigateTo = useCallback((id: number) => {
    const queue = searchParams.get('queue')
    router.push(`/campaigns/${id}${queue ? `?queue=${queue}` : ''}`)
  }, [router, searchParams])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && hasPrev) {
        navigateTo(queueIds[currentIndex - 1])
      } else if (e.key === 'ArrowRight' && hasNext) {
        navigateTo(queueIds[currentIndex + 1])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, queueIds, currentIndex, navigateTo])

  useEffect(() => {
    setLoading(true)
    setUniqueStats(null)
    fetchCampaign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function fetchCampaign() {
    try {
      const res = await fetch(`/api/listmonk/campaigns/${params.id}`)
      const data = await res.json()
      setCampaign(data.data)

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
  const uniqueClickRate = uniqueOpens > 0 ? ((uniqueClicks / uniqueOpens) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6">
      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Link
            href="/campaigns"
            className="text-sm text-text-light hover:text-text-mid mb-1 block"
          >
            &larr; Back to Campaigns
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{campaign.name}</h1>
          <p className="text-sm text-text-light mt-1">{campaign.subject}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
      </div>

      {/* Queue navigation */}
      {queueIds.length > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-border-custom px-4 py-3">
          <button
            onClick={() => hasPrev && navigateTo(queueIds[currentIndex - 1])}
            disabled={!hasPrev}
            className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-30 text-accent hover:text-accent-bright transition-colors disabled:cursor-default"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Previous
          </button>

          <span className="text-sm text-text-mid">
            Campaign <span className="font-medium text-navy">{queuePosition}</span>
            <span className="text-text-light ml-1 text-xs">(use arrow keys)</span>
          </span>

          <button
            onClick={() => hasNext && navigateTo(queueIds[currentIndex + 1])}
            disabled={!hasNext}
            className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-30 text-accent hover:text-accent-bright transition-colors disabled:cursor-default"
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

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
