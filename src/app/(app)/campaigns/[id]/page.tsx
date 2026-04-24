'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useData } from '@/lib/DataProvider'
import CampaignPreviewModal from '@/components/campaigns/CampaignPreviewModal'
import SendTestModal from '@/components/campaigns/SendTestModal'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

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
  unsubs: number
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [uniqueStats, setUniqueStats] = useState<UniqueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ link: string } | null>(null)
  const [showWpClientPicker, setShowWpClientPicker] = useState(false)
  const [wpClients, setWpClients] = useState<{ id: string; name: string }[]>([])
  const [wpClientsLoaded, setWpClientsLoaded] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [topLinks, setTopLinks] = useState<{ url: string; count: number }[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const { userRole } = useData()

  // Queue navigation
  const queueIds = useMemo(() => {
    const q = searchParams.get('queue')
    return q ? q.split(',').map(Number).filter(Boolean) : []
  }, [searchParams])

  const instanceParam = searchParams.get('instance')
  const qs = instanceParam ? `?instance=${instanceParam}` : ''
  const currentId = Number(params.id)
  const currentIndex = queueIds.indexOf(currentId)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < queueIds.length - 1
  const queuePosition = currentIndex >= 0 ? `${currentIndex + 1} of ${queueIds.length}` : null

  const navigateTo = useCallback((id: number) => {
    const instance = searchParams.get('instance')
    const queue = searchParams.get('queue')
    const params = new URLSearchParams()
    if (queue) params.set('queue', queue)
    if (instance) params.set('instance', instance)
    const qs = params.toString()
    router.push(`/campaigns/${id}${qs ? `?${qs}` : ''}`)
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
      const instance = searchParams.get('instance')
      const instanceQuery = instance ? `?instance=${instance}` : ''
      const instanceParam = instance ? `&instance=${instance}` : ''

      const res = await fetch(`/api/listmonk/campaigns/${params.id}${instanceQuery}`)
      const data = await res.json()
      setCampaign(data.data)

      if (data.data?.status === 'finished' || data.data?.status === 'running') {
        const statsRes = await fetch(`/api/campaigns/unique-stats?ids=${params.id}${instanceParam}`)
        const statsData = await statsRes.json()
        if (statsData.data?.[params.id as string]) {
          setUniqueStats(statsData.data[params.id as string])
        }

        // Fetch top clicked links
        setLinksLoading(true)
        try {
          const startDate = data.data.started_at || data.data.created_at || '2020-01-01T00:00:00Z'
          const from = new Date(startDate).toISOString()
          const to = new Date().toISOString()
          const linksRes = await fetch(
            `/api/listmonk/campaigns/analytics/links?id=${params.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${instanceParam}`
          )
          if (linksRes.ok) {
            const linksData = await linksRes.json()
            const links = (linksData.data || [])
              .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
            setTopLinks(links)
          }
        } catch {
          // Link stats are optional
        } finally {
          setLinksLoading(false)
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
      const instance = searchParams.get('instance')
      const instanceQuery = instance ? `?instance=${instance}` : ''
      await fetch(`/api/listmonk/campaigns/${params.id}/status${instanceQuery}`, {
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

  function handlePublishClick() {
    const instance = searchParams.get('instance')
    if (instance || userRole !== 'admin') {
      // Client user or admin with instance selected — publish directly
      publishToWordPress(undefined)
    } else {
      // Admin without instance — show client picker
      if (!wpClientsLoaded) {
        fetch('/api/settings/clients')
          .then((r) => r.json())
          .then((json) => {
            const list = (json.data || [])
              .filter((c: { wordpress_url?: string | null }) => c.wordpress_url)
              .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
            setWpClients(list)
            setWpClientsLoaded(true)
          })
          .catch(() => {})
      }
      setShowWpClientPicker(true)
    }
  }

  async function publishToWordPress(wpClientId?: string) {
    setPublishing(true)
    setPublishResult(null)
    setShowWpClientPicker(false)
    try {
      const instance = searchParams.get('instance')
      const res = await fetch('/api/campaigns/publish-wordpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: params.id,
          instanceId: instance || undefined,
          wpClientId: wpClientId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || 'Failed to publish')
      } else {
        setPublishResult({ link: json.post?.link })
      }
    } catch (err) {
      console.error('Failed to publish to WordPress:', err)
      alert('Failed to publish to WordPress')
    } finally {
      setPublishing(false)
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
  const unsubs = uniqueStats?.unsubs ?? 0
  const uniqueOpenRate = campaign.sent > 0 ? ((uniqueOpens / campaign.sent) * 100).toFixed(1) : '0.0'
  const uniqueClickRate = uniqueOpens > 0 ? ((uniqueClicks / uniqueOpens) * 100).toFixed(1) : '0.0'
  const unsubRate = campaign.sent > 0 ? ((unsubs / campaign.sent) * 100).toFixed(2) : '0.00'

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
          {!DEMO_MODE && campaign.status === 'draft' && (
            <Link
              href={`/campaigns/${currentId}/edit${qs}`}
              className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm transition-colors"
            >
              Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm transition-colors"
          >
            Preview
          </button>
          {!DEMO_MODE && campaign.status === 'draft' && (
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm transition-colors"
            >
              Send Test
            </button>
          )}
          {!DEMO_MODE && campaign.status === 'draft' && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
            >
              {sending ? 'Starting...' : 'Send Campaign'}
            </button>
          )}
          {!DEMO_MODE && (
            <button
              onClick={handlePublishClick}
              disabled={publishing}
              className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
            >
              {publishing ? 'Publishing...' : 'Publish to WordPress'}
            </button>
          )}
        </div>
      </div>

      {publishResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          Published to WordPress.{' '}
          {publishResult.link && (
            <a
              href={publishResult.link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              View post
            </a>
          )}
        </div>
      )}

      {/* Queue navigation */}
      {queueIds.length > 1 && (
        <div className="flex items-center justify-between bg-surface rounded-xl border border-border-custom px-4 py-3">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
        <StatCard
          label="Unsubs"
          value={`${unsubs.toLocaleString()} (${unsubRate}%)`}
        />
        <StatCard label="Bounces" value={campaign.bounces?.toLocaleString() || '0'} />
        <StatCard label="Bounce Rate" value={campaign.sent > 0 ? `${((campaign.bounces / campaign.sent) * 100).toFixed(1)}%` : '0.0%'} />
      </div>

      <div className="bg-surface rounded-xl border border-border-custom p-5">
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

      {/* Most Clicked Links */}
      {(linksLoading || topLinks.length > 0) && (
        <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
          <div className="px-5 py-4 border-b border-border-custom">
            <h2 className="text-sm font-medium text-text-mid uppercase tracking-wider">
              Most Clicked Links
            </h2>
          </div>
          {linksLoading ? (
            <div className="p-5 space-y-3">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                    <th className="text-left px-4 py-3 font-medium w-8">#</th>
                    <th className="text-left px-4 py-3 font-medium">Link</th>
                    <th className="text-right px-4 py-3 font-medium">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {topLinks.map((link, i) => (
                    <tr key={i} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                      <td className="px-4 py-3 text-text-light font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3 min-w-0 max-w-md">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-bright truncate block"
                          title={link.url}
                        >
                          {link.url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-navy tabular-nums">
                        {link.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showPreviewModal && (
        <CampaignPreviewModal
          campaignId={currentId}
          instanceId={searchParams.get('instance') || undefined}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {showTestModal && (
        <SendTestModal
          campaignId={currentId}
          instanceId={searchParams.get('instance') || undefined}
          onClose={() => setShowTestModal(false)}
        />
      )}

      {showWpClientPicker && (
        <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-border-custom p-6 max-w-sm w-full">
            <h3 className="font-display text-xl text-navy mb-2 uppercase">
              Publish to WordPress
            </h3>
            <p className="text-sm text-text-mid mb-4">
              Select which client&apos;s WordPress site to publish to.
            </p>
            {wpClients.length === 0 ? (
              <p className="text-sm text-text-light mb-4">
                No clients have WordPress configured. Add credentials in Settings → Clients.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
                {wpClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => publishToWordPress(c.id)}
                    className="w-full text-left px-4 py-2.5 rounded-lg text-sm text-navy hover:bg-accent-wash transition-colors"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowWpClientPicker(false)}
                className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border-custom p-5">
      <p className="text-xs text-text-light uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-3xl text-navy">{value}</p>
      {sub && <p className="text-xs text-text-light mt-1">{sub}</p>}
    </div>
  )
}
