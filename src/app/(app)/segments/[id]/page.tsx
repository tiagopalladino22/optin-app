'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SegmentRuleEditor, { type SegmentRule } from '@/components/segments/SegmentRuleEditor'

interface Segment {
  id: string
  name: string
  description: string | null
  logic: 'and' | 'or'
  rules: SegmentRule[]
  subscriber_count: number
  exported_list_id: number | null
  last_run_at: string | null
  created_at: string
}

interface SubscriberResult {
  id: number
  email: string
  name: string
  attribs: Record<string, unknown>
  lists: { id: number; name: string }[]
}

export default function SegmentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [segment, setSegment] = useState<Segment | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editRules, setEditRules] = useState<SegmentRule[]>([])
  const [editLogic, setEditLogic] = useState<'and' | 'or'>('and')

  // Subscribers
  const [subscribers, setSubscribers] = useState<SubscriberResult[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subsCount, setSubsCount] = useState(0)
  const [deletingSub, setDeletingSub] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // Performance stats
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfStats, setPerfStats] = useState<{
    campaignCount: number
    avgOpenRate: number
    avgCtr: number
    totalSent: number
    totalOpens: number
    totalClicks: number
  } | null>(null)

  const fetchSegment = useCallback(async () => {
    try {
      const res = await fetch(`/api/segments/${params.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSegment(data.data)
      setEditName(data.data.name)
      setEditDescription(data.data.description || '')
      setEditRules(data.data.rules)
      setEditLogic(data.data.logic)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load segment')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchSegment()
  }, [fetchSegment])

  // Load subscribers matching this segment
  const loadSubscribers = useCallback(async () => {
    if (!segment) return
    setSubsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: segment.rules,
          logic: segment.logic,
          returnAll: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSubscribers(data.sample || [])
      setSubsCount(data.count || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscribers')
    } finally {
      setSubsLoading(false)
    }
  }, [segment])

  useEffect(() => {
    if (segment && !editing) {
      loadSubscribers()
    }
  }, [segment, editing, loadSubscribers])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/segments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.id,
          name: editName.trim(),
          description: editDescription.trim() || null,
          rules: editRules.filter((r) => {
            if (!r.field) return false
            if (r.field === 'from_lists') return !!r.value
            return r.operator && r.value
          }),
          logic: editLogic,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSegment(data.data)
      setEditing(false)
      setSuccess('Segment updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this segment? This cannot be undone.')) return
    try {
      const res = await fetch('/api/segments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: params.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      router.push('/segments')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function handleDeleteSubscriber(subId: number, email: string) {
    if (!confirm(`Remove subscriber "${email}" from all lists in this segment?`)) return
    setDeletingSub(subId)
    try {
      // Get list IDs from segment rules
      const listRule = segment?.rules.find((r) => r.field === 'from_lists')
      const listIds = listRule?.value ? listRule.value.split(',').map(Number).filter(Boolean) : []

      if (listIds.length === 0) {
        // No list filter — delete subscriber entirely from Listmonk
        const res = await fetch(`/api/listmonk/subscribers/${subId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete subscriber')
      } else {
        // Remove subscriber from the segment's lists
        const res = await fetch(`/api/listmonk/subscribers/lists`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: [subId],
            action: 'remove',
            target_list_ids: listIds,
          }),
        })
        if (!res.ok) throw new Error('Failed to remove subscriber from lists')
      }

      setSubscribers((prev) => prev.filter((s) => s.id !== subId))
      setSubsCount((prev) => prev - 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove subscriber')
    } finally {
      setDeletingSub(null)
    }
  }

  // Load avg performance from campaigns targeting this segment's lists
  const loadPerformance = useCallback(async () => {
    if (!segment) return
    const listRule = segment.rules.find((r) => r.field === 'from_lists')
    const listIds = listRule?.value ? listRule.value.split(',').map(Number).filter(Boolean) : []
    if (listIds.length === 0) return

    setPerfLoading(true)
    try {
      // Fetch finished campaigns
      const allCampaigns: { id: number; sent: number; lists: { id: number }[] }[] = []
      let page = 1
      while (true) {
        const res = await fetch(`/api/listmonk/campaigns?status=finished&per_page=100&page=${page}`)
        if (!res.ok) break
        const data = await res.json()
        const results = data.data?.results || []
        for (const c of results) {
          const targets = (c.lists || []).some((l: { id: number }) => listIds.includes(l.id))
          if (targets && c.sent > 0) {
            allCampaigns.push({ id: c.id, sent: c.sent, lists: c.lists })
          }
        }
        if (results.length < 100) break
        page++
      }

      if (allCampaigns.length === 0) {
        setPerfStats({ campaignCount: 0, avgOpenRate: 0, avgCtr: 0, totalSent: 0, totalOpens: 0, totalClicks: 0 })
        return
      }

      // Fetch unique stats in batch
      const ids = allCampaigns.map((c) => c.id).join(',')
      const statsRes = await fetch(`/api/campaigns/unique-stats?ids=${ids}`)
      const statsData = await statsRes.json()
      const statsMap = statsData.data || {}

      let totalSent = 0
      let totalOpens = 0
      let totalClicks = 0
      for (const c of allCampaigns) {
        const stats = statsMap[c.id]
        totalSent += c.sent
        totalOpens += stats?.uniqueOpens ?? 0
        totalClicks += stats?.uniqueClicks ?? 0
      }

      setPerfStats({
        campaignCount: allCampaigns.length,
        avgOpenRate: totalSent > 0 ? parseFloat(((totalOpens / totalSent) * 100).toFixed(1)) : 0,
        avgCtr: totalOpens > 0 ? parseFloat(((totalClicks / totalOpens) * 100).toFixed(1)) : 0,
        totalSent,
        totalOpens,
        totalClicks,
      })
    } catch (err) {
      console.error('Failed to load performance:', err)
    } finally {
      setPerfLoading(false)
    }
  }, [segment])

  useEffect(() => {
    if (segment && !editing) loadPerformance()
  }, [segment, editing, loadPerformance])

  function handleExport() {
    if (subscribers.length === 0) return
    setExporting(true)
    try {
      const headers = ['Email', 'Name', 'Lists', 'Attributes']
      const rows = subscribers.map((s) => [
        `"${s.email}"`,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${s.lists?.map((l) => l.name).join('; ') || ''}"`,
        `"${JSON.stringify(s.attribs || {}).replace(/"/g, '""')}"`,
      ].join(','))
      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `segment-${segment?.name || params.id}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
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

  if (!segment) {
    return <p className="text-text-mid">Segment not found.</p>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/segments" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Segments
          </Link>
          {!editing && (
            <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{segment.name}</h1>
          )}
          {!editing && segment.description && (
            <p className="text-sm text-text-light mt-1">{segment.description}</p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting || subscribers.length === 0}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm text-red-500 border border-red-200 hover:bg-red-50 rounded-lg"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Edit Mode */}
      {editing && (
        <div className="space-y-5">
          <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Segment Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">
                Description <span className="text-text-light">(optional)</span>
              </label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border-custom p-5">
            <h2 className="text-sm font-medium text-text-mid mb-3">Filter Rules</h2>
            <SegmentRuleEditor
              rules={editRules}
              logic={editLogic}
              onChange={setEditRules}
              onLogicChange={setEditLogic}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setEditName(segment.name)
                setEditDescription(segment.description || '')
                setEditRules(segment.rules)
                setEditLogic(segment.logic)
              }}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Segment Info Cards */}
      {!editing && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Subscribers</p>
              <p className="font-display text-3xl text-navy">
                {subsLoading ? '...' : subsCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Rules</p>
              <p className="font-display text-3xl text-navy">{segment.rules.length}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Logic</p>
              <p className="font-display text-3xl text-navy uppercase">{segment.logic}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Exported</p>
              <p className="font-display text-3xl text-navy">
                {segment.exported_list_id ? `#${segment.exported_list_id}` : '—'}
              </p>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="bg-surface rounded-xl border border-border-custom p-5">
            <h2 className="text-sm font-medium text-text-mid uppercase tracking-wider mb-4">
              Avg Campaign Performance
              {perfStats && !perfLoading && (
                <span className="text-text-light font-normal normal-case ml-2">
                  ({perfStats.campaignCount} campaign{perfStats.campaignCount !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
            {perfLoading ? (
              <div className="flex gap-4">
                <div className="skeleton h-16 w-32" />
                <div className="skeleton h-16 w-32" />
              </div>
            ) : perfStats && perfStats.campaignCount > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-light mb-1">Avg Open Rate</p>
                  <p className="font-display text-3xl text-accent">{perfStats.avgOpenRate}%</p>
                  <p className="text-xs text-text-light mt-0.5">{perfStats.totalOpens.toLocaleString()} opens / {perfStats.totalSent.toLocaleString()} sent</p>
                </div>
                <div>
                  <p className="text-xs text-text-light mb-1">Avg CTR</p>
                  <p className="font-display text-3xl text-accent">{perfStats.avgCtr}%</p>
                  <p className="text-xs text-text-light mt-0.5">{perfStats.totalClicks.toLocaleString()} clicks / {perfStats.totalOpens.toLocaleString()} opens</p>
                </div>
                <div>
                  <p className="text-xs text-text-light mb-1">Total Sent</p>
                  <p className="font-display text-3xl text-navy">{perfStats.totalSent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-text-light mb-1">Campaigns</p>
                  <p className="font-display text-3xl text-navy">{perfStats.campaignCount}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-light">No finished campaigns targeting this segment&apos;s lists yet.</p>
            )}
          </div>
        </>
      )}

      {/* Subscribers Table */}
      {!editing && (
        <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-custom">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">
              Matching Subscribers
            </h2>
            <button
              onClick={loadSubscribers}
              disabled={subsLoading}
              className="text-xs text-accent hover:text-accent-bright font-medium disabled:opacity-50"
            >
              {subsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {subsLoading ? (
            <div className="p-5 space-y-3">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ) : subscribers.length === 0 ? (
            <div className="p-8 text-center text-text-light text-sm">
              No subscribers match this segment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Lists</th>
                    <th className="text-left px-4 py-3 font-medium">Attributes</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((sub) => (
                    <tr key={sub.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                      <td className="px-4 py-3 text-navy font-medium">{sub.email}</td>
                      <td className="px-4 py-3 text-text-mid">{sub.name || '—'}</td>
                      <td className="px-4 py-3 text-text-light text-xs">
                        {sub.lists?.map((l) => l.name).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-text-light text-xs font-mono">
                        {Object.keys(sub.attribs || {}).length > 0
                          ? JSON.stringify(sub.attribs).slice(0, 60)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteSubscriber(sub.id, sub.email)}
                          disabled={deletingSub === sub.id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          {deletingSub === sub.id ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!subsLoading && subsCount > subscribers.length && (
            <div className="px-5 py-3 border-t border-border-custom text-xs text-text-light">
              Showing {subscribers.length} of {subsCount.toLocaleString()} subscribers
            </div>
          )}
        </div>
      )}
    </div>
  )
}
