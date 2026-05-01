'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import CsvImport from '@/components/lists/CsvImport'
import Pagination from '@/components/ui/Pagination'
import { useData } from '@/lib/DataProvider'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const SUBS_PER_PAGE = 50

interface ListDetail {
  id: number
  name: string
  type: string
  optin: string
  subscriber_count: number
  description: string
  tags: string[]
  created_at: string
}

interface SubscriberResult {
  id: number
  email: string
  name: string
  status: string
  attribs: Record<string, unknown>
  lists: { id: number; name: string }[]
}

export default function ListDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { lists: overviewLists } = useData()
  const [list, setList] = useState<ListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editType, setEditType] = useState<'private' | 'public' | 'temporary'>('private')
  const [editOptin, setEditOptin] = useState<'single' | 'double'>('single')
  const [editTags, setEditTags] = useState('')

  // Subscribers
  const [subscribers, setSubscribers] = useState<SubscriberResult[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subsTotal, setSubsTotal] = useState(0)
  const [subsPage, setSubsPage] = useState(1)
  const [deletingSub, setDeletingSub] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)

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

  const instanceQuery = searchParams.get('instance')
    ? `&instance=${searchParams.get('instance')}`
    : ''
  const instanceQueryFirst = searchParams.get('instance')
    ? `?instance=${searchParams.get('instance')}`
    : ''

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/listmonk/lists/${params.id}${instanceQueryFirst}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setList(data.data)
      setEditName(data.data.name || '')
      setEditDescription(data.data.description || '')
      setEditType((data.data.type as 'private' | 'public' | 'temporary') || 'private')
      setEditOptin((data.data.optin as 'single' | 'double') || 'single')
      setEditTags((data.data.tags || []).join(', '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load list')
    } finally {
      setLoading(false)
    }
  }, [params.id, instanceQueryFirst])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // Load subscribers for this list (paginated via Listmonk's native list_id filter).
  const loadSubscribers = useCallback(async () => {
    if (!list) return
    setSubsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/listmonk/subscribers?list_id=${list.id}&page=${subsPage}&per_page=${SUBS_PER_PAGE}${instanceQuery}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load subscribers')
      setSubscribers(data.data?.results || [])
      setSubsTotal(data.data?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscribers')
    } finally {
      setSubsLoading(false)
    }
  }, [list, subsPage, instanceQuery])

  useEffect(() => {
    if (list && !editing) loadSubscribers()
  }, [list, editing, loadSubscribers])

  // Load avg performance from finished campaigns that target this list.
  const loadPerformance = useCallback(async () => {
    if (!list) return
    setPerfLoading(true)
    try {
      const allCampaigns: { id: number; sent: number }[] = []
      let page = 1
      while (true) {
        const res = await fetch(
          `/api/listmonk/campaigns?status=finished&per_page=100&page=${page}${instanceQuery}`
        )
        if (!res.ok) break
        const data = await res.json()
        const results = data.data?.results || []
        for (const c of results) {
          const targets = (c.lists || []).some((l: { id: number }) => l.id === list.id)
          if (targets && c.sent > 0) {
            allCampaigns.push({ id: c.id, sent: c.sent })
          }
        }
        if (results.length < 100) break
        page++
      }

      if (allCampaigns.length === 0) {
        setPerfStats({ campaignCount: 0, avgOpenRate: 0, avgCtr: 0, totalSent: 0, totalOpens: 0, totalClicks: 0 })
        return
      }

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
  }, [list, instanceQuery])

  useEffect(() => {
    if (list && !editing) loadPerformance()
  }, [list, editing, loadPerformance])

  async function handleSave() {
    if (!list) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const tags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await fetch(`/api/listmonk/lists/${list.id}${instanceQueryFirst}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          type: editType,
          optin: editOptin,
          tags,
          description: editDescription.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to save')
      setList(data.data)
      setEditing(false)
      setSuccess('List updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSubscriber(subId: number, email: string) {
    if (!list) return
    if (!confirm(`Remove "${email}" from this list?`)) return
    setDeletingSub(subId)
    try {
      const res = await fetch(`/api/listmonk/subscribers/lists${instanceQueryFirst}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [subId],
          action: 'remove',
          target_list_ids: [list.id],
        }),
      })
      if (!res.ok) throw new Error('Failed to remove subscriber from list')
      setSubscribers((prev) => prev.filter((s) => s.id !== subId))
      setSubsTotal((prev) => prev - 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove subscriber')
    } finally {
      setDeletingSub(null)
    }
  }

  async function handleExport() {
    if (!list) return
    setExporting(true)
    setExportProgress({ current: 0, total: 0 })
    try {
      const PAGE_SIZE = 1000
      const allSubs: SubscriberResult[] = []
      let page = 1
      let total = 0

      while (true) {
        const res = await fetch(
          `/api/listmonk/subscribers?list_id=${list.id}&page=${page}&per_page=${PAGE_SIZE}${instanceQuery}`
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Export failed')

        const batch: SubscriberResult[] = data.data?.results || []
        if (page === 1) total = data.data?.total || batch.length
        allSubs.push(...batch)
        setExportProgress({ current: allSubs.length, total })

        if (batch.length < PAGE_SIZE) break
        if (allSubs.length >= total) break
        page++
      }

      if (allSubs.length === 0) return

      const attribKeys = Array.from(
        allSubs.reduce((set, s) => {
          for (const k of Object.keys(s.attribs || {})) set.add(k)
          return set
        }, new Set<string>())
      ).sort()

      const csvCell = (val: unknown): string => {
        if (val === null || val === undefined) return '""'
        const str = typeof val === 'string' ? val : JSON.stringify(val)
        return `"${str.replace(/"/g, '""')}"`
      }

      const headers = ['Email', 'Name', 'Status', ...attribKeys]
      const rows = allSubs.map((s) =>
        [
          csvCell(s.email),
          csvCell(s.name || ''),
          csvCell(s.status || ''),
          ...attribKeys.map((k) => csvCell((s.attribs || {})[k])),
        ].join(',')
      )
      const csv = [headers.map((h) => csvCell(h)).join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `list-${list.name || list.id}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
      </div>
    )
  }

  if (!list) {
    return <p className="text-text-mid">List not found.</p>
  }

  // Prefer the count from the overview (cached subscriber_count via /api/lists)
  // so the number on this page matches what the user just saw on /lists.
  // The single-list endpoint /api/lists/{id} sometimes returns a different value.
  const overviewMatch = overviewLists.find((l) => l.id === list.id)
  const displayedSubCount =
    typeof overviewMatch?.subscriber_count === 'number'
      ? overviewMatch.subscriber_count
      : list.subscriber_count

  const totalPages = Math.max(1, Math.ceil(subsTotal / SUBS_PER_PAGE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/lists" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Lists
          </Link>
          {!editing && (
            <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{list.name}</h1>
          )}
        </div>
        {!editing && !DEMO_MODE && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting || displayedSubCount === 0}
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
          </div>
        )}
      </div>

      {exportProgress && (
        <div className="bg-surface border border-border-custom rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-mid">
              {exportProgress.total > 0
                ? `Exporting ${exportProgress.current.toLocaleString()} of ${exportProgress.total.toLocaleString()} subscribers...`
                : 'Preparing export...'}
            </span>
            {exportProgress.total > 0 && (
              <span className="text-text-light tabular-nums">
                {Math.round((exportProgress.current / exportProgress.total) * 100)}%
              </span>
            )}
          </div>
          <div className="h-2 bg-offwhite rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{
                width:
                  exportProgress.total > 0
                    ? `${Math.min(100, (exportProgress.current / exportProgress.total) * 100)}%`
                    : '5%',
              }}
            />
          </div>
        </div>
      )}

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

      {editing ? (
        <div className="space-y-5">
          <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'private' | 'public' | 'temporary')}
                  className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                  <option value="temporary">Temporary</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">Opt-in</label>
                <select
                  value={editOptin}
                  onChange={(e) => setEditOptin(e.target.value as 'single' | 'double')}
                  className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">
                Tags <span className="text-text-light">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="newsletter, weekly"
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
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
                setEditName(list.name)
                setEditDescription(list.description || '')
                setEditType((list.type as 'private' | 'public' | 'temporary') || 'private')
                setEditOptin((list.optin as 'single' | 'double') || 'single')
                setEditTags((list.tags || []).join(', '))
              }}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface rounded-xl border border-border-custom p-5">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Subscribers</p>
              <p className="font-display text-3xl text-navy">
                {displayedSubCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-border-custom p-5">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Type</p>
              <p className="font-display text-3xl text-navy capitalize">{list.type}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border-custom p-5">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Opt-in</p>
              <p className="font-display text-3xl text-navy capitalize">{list.optin}</p>
            </div>
          </div>

          {list.description && (
            <div className="bg-surface rounded-xl border border-border-custom p-5">
              <h2 className="text-sm font-medium text-text-mid mb-2">Description</h2>
              <p className="text-text-mid">{list.description}</p>
            </div>
          )}

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
              <p className="text-sm text-text-light">No finished campaigns targeting this list yet.</p>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-custom">
              <h2 className="font-display text-xl tracking-wide text-navy uppercase">
                Subscribers
                {displayedSubCount > 0 && (
                  <span className="text-text-light text-sm font-normal normal-case ml-2">
                    ({displayedSubCount.toLocaleString()})
                  </span>
                )}
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
                No subscribers in this list.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                      <th className="text-left px-4 py-3 font-medium">Email</th>
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Attributes</th>
                      {!DEMO_MODE && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub) => (
                      <tr key={sub.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                        <td className="px-4 py-3 text-navy font-medium">{sub.email}</td>
                        <td className="px-4 py-3 text-text-mid">{sub.name || '—'}</td>
                        <td className="px-4 py-3 text-text-mid capitalize">{sub.status || '—'}</td>
                        <td className="px-4 py-3 text-text-light text-xs font-mono">
                          {Object.keys(sub.attribs || {}).length > 0
                            ? JSON.stringify(sub.attribs).slice(0, 60)
                            : '—'}
                        </td>
                        {!DEMO_MODE && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteSubscriber(sub.id, sub.email)}
                              disabled={deletingSub === sub.id}
                              className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                              {deletingSub === sub.id ? 'Removing...' : 'Remove'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border-custom">
                <Pagination currentPage={subsPage} totalPages={totalPages} onPageChange={setSubsPage} />
              </div>
            )}
          </div>

          {!DEMO_MODE && <CsvImport listId={list.id} />}
        </>
      )}
    </div>
  )
}
