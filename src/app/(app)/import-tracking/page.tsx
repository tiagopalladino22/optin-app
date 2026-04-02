'use client'

import { useState, useEffect, useCallback } from 'react'

interface TrackingRecord {
  id: string
  list_id: number
  list_name: string
  publication_code: string | null
  import_date: string
  imported_count: number
  week1_opens: number | null
  week2_opens: number | null
  week3_opens: number | null
  week4_opens: number | null
  remaining_subs: number | null
  status: string
  created_at: string
}

interface ListmonkList {
  id: number
  name: string
  subscriber_count?: number
}

interface Client {
  id: string
  name: string
  listmonk_url: string | null
}

export default function ImportTrackingPage() {
  const [records, setRecords] = useState<TrackingRecord[]>([])
  const [lists, setLists] = useState<ListmonkList[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [listSearch, setListSearch] = useState('')

  // Client selector
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // Form state
  const [selectedLists, setSelectedLists] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/import-tracking')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setRecords(data)
    } catch {
      setError('Failed to load tracking records')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLists = useCallback(async (clientId?: string | null) => {
    try {
      if (clientId) {
        const res = await fetch(`/api/settings/client-lists?client_id=${clientId}`)
        if (!res.ok) return
        const data = await res.json()
        setLists(data.data || [])
      } else {
        const allLists: ListmonkList[] = []
        let page = 1
        while (true) {
          const res = await fetch(`/api/listmonk/lists?per_page=100&page=${page}`)
          if (!res.ok) break
          const data = await res.json()
          const results = data?.data?.results || data?.results || []
          allLists.push(...results)
          if (results.length < 100) break
          page++
        }
        setLists(allLists)
      }
    } catch {
      // Lists fetch is optional
    }
  }, [])

  // Fetch clients with their own Listmonk instance
  useEffect(() => {
    fetch('/api/settings/clients')
      .then((res) => res.json())
      .then((data) => {
        const clientList = Array.isArray(data) ? data : data.data || []
        setClients(clientList.filter((c: Client) => c.listmonk_url))
      })
      .catch(() => {})
  }, [])

  // Re-fetch lists when client changes
  useEffect(() => {
    setLists([])
    setSelectedLists(new Set())
    fetchLists(selectedClientId)
  }, [selectedClientId, fetchLists])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  function toggleListSelection(listId: number) {
    setSelectedLists((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) {
        next.delete(listId)
      } else {
        next.add(listId)
      }
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedLists((prev) => {
      const next = new Set(prev)
      filteredLists.forEach((l) => next.add(l.id))
      return next
    })
  }

  function deselectAll() {
    setSelectedLists(new Set())
  }

  function detectPubCode(name: string): string | null {
    const match = name.match(/^([A-Z]{3})\s*-/)
    return match ? match[1] : null
  }

  function detectImportDate(name: string): string {
    const dateMatch = name.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
    if (dateMatch) {
      const parts = dateMatch[1].split('/')
      const d = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`)
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0]
      }
    }
    return new Date().toISOString().split('T')[0]
  }

  async function handleSave() {
    if (selectedLists.size === 0) {
      setError('Select at least one list')
      return
    }

    setSaving(true)
    setError('')
    let added = 0
    const errors: string[] = []

    for (const listId of Array.from(selectedLists)) {
      const list = lists.find((l) => l.id === listId)
      if (!list) continue

      try {
        const res = await fetch('/api/import-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            list_id: list.id,
            list_name: list.name,
            publication_code: detectPubCode(list.name),
            import_date: detectImportDate(list.name),
            imported_count: list.subscriber_count || 0,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          errors.push(`${list.name}: ${data.error || 'Failed'}`)
        } else {
          added++
        }
      } catch {
        errors.push(`${list.name}: Network error`)
      }
    }

    if (errors.length > 0) {
      setError(`${errors.length} failed: ${errors[0]}`)
    }
    if (added > 0) {
      setSuccess(`${added} list${added > 1 ? 's' : ''} added to tracking!`)
      setTimeout(() => setSuccess(''), 3000)
    }

    setShowForm(false)
    setSelectedLists(new Set())
    setListSearch('')
    fetchRecords()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this tracking record?')) return
    try {
      await fetch(`/api/import-tracking?id=${id}`, { method: 'DELETE' })
      fetchRecords()
    } catch {
      setError('Failed to delete')
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    try {
      const res = await fetch('/api/import-tracking/refresh', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to refresh')
      const data = await res.json()
      setSuccess(`Snapshots refreshed! ${data.message || ''}`)
      fetchRecords()
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Failed to refresh snapshots. Try again later.')
    } finally {
      setRefreshing(false)
    }
  }

  const trackedListIds = new Set(records.map((r) => r.list_id))
  const filteredLists = lists.filter((l) =>
    !trackedListIds.has(l.id) && l.name.toLowerCase().includes(listSearch.toLowerCase())
  )

  // Pub code filter for the tracking table
  const [activePubFilter, setActivePubFilter] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState('')

  const pubCodes = Array.from(
    new Set(records.map((r) => r.publication_code).filter(Boolean))
  ).sort() as string[]

  const filteredRecords = records.filter((r) => {
    if (activePubFilter && r.publication_code !== activePubFilter) return false
    if (tableSearch) {
      const q = tableSearch.toLowerCase()
      return r.list_name.toLowerCase().includes(q) || (r.publication_code || '').toLowerCase().includes(q)
    }
    return true
  })

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="bg-white rounded-xl border border-border-custom p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-10 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Import Tracking</h1>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Snapshots'}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium transition-colors"
          >
            {showForm ? 'Cancel' : 'Add Tracking'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">{success}</div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-border-custom p-6 space-y-4">
          <h3 className="font-display text-xl tracking-wide text-navy uppercase">Track New Import</h3>

          {clients.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Listmonk Instance</label>
              <select
                value={selectedClientId || ''}
                onChange={(e) => setSelectedClientId(e.target.value || null)}
                className="w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                <option value="">Default (optin150.com)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.listmonk_url}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-mid">Select Lists</label>
              <div className="flex gap-3 text-xs">
                <button onClick={selectAllFiltered} className="text-accent hover:text-accent-bright">
                  Select all{listSearch ? ' filtered' : ''}
                </button>
                {selectedLists.size > 0 && (
                  <button onClick={deselectAll} className="text-text-light hover:text-text-mid">
                    Deselect all
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              placeholder="Search lists..."
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm mb-2"
            />
            <div className="max-h-64 overflow-y-auto border border-border-custom rounded-lg bg-white">
              {filteredLists.length === 0 ? (
                <p className="px-3 py-2 text-sm text-text-light">No lists found</p>
              ) : (
                filteredLists.map((list) => (
                  <label
                    key={list.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-offwhite transition-colors ${
                      selectedLists.has(list.id) ? 'bg-accent-wash' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLists.has(list.id)}
                      onChange={() => toggleListSelection(list.id)}
                      className="rounded border-border-custom text-accent focus:ring-accent"
                    />
                    <span className={selectedLists.has(list.id) ? 'text-accent font-medium' : 'text-text-primary'}>
                      {list.name}
                    </span>
                    {list.subscriber_count !== undefined && (
                      <span className="text-text-light ml-auto text-xs">{list.subscriber_count}</span>
                    )}
                  </label>
                ))
              )}
            </div>
            {selectedLists.size > 0 && (
              <p className="mt-2 text-sm text-accent font-medium">
                {selectedLists.size} list{selectedLists.size > 1 ? 's' : ''} selected
              </p>
            )}
            <p className="mt-1 text-xs text-text-light">
              Publication code, import date, and subscriber count are auto-detected from list names.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || selectedLists.size === 0}
              className="px-5 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : `Track ${selectedLists.size || ''} List${selectedLists.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Pub code filter tags + search */}
      {records.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActivePubFilter(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePubFilter === null
                  ? 'bg-navy text-white'
                  : 'bg-offwhite text-text-mid hover:bg-border-custom'
              }`}
            >
              All ({records.length})
            </button>
            {pubCodes.map((code) => {
              const count = records.filter((r) => r.publication_code === code).length
              return (
                <button
                  key={code}
                  onClick={() => setActivePubFilter(activePubFilter === code ? null : code)}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-colors ${
                    activePubFilter === code
                      ? 'bg-accent text-white'
                      : 'bg-accent-wash text-accent hover:bg-accent/20'
                  }`}
                >
                  {code} ({count})
                </button>
              )
            })}
          </div>
          <input
            type="text"
            placeholder="Search lists..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="ml-auto px-3 py-1.5 border border-border-custom rounded-lg text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent w-56"
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider">
                <th className="text-left px-4 py-3 font-medium">List Name</th>
                <th className="text-left px-4 py-3 font-medium">Pub</th>
                <th className="text-right px-4 py-3 font-medium">Imported</th>
                <th className="text-right px-4 py-3 font-medium">Week 1</th>
                <th className="text-right px-4 py-3 font-medium">Week 2</th>
                <th className="text-right px-4 py-3 font-medium">Week 3</th>
                <th className="text-right px-4 py-3 font-medium">Week 4</th>
                <th className="text-right px-4 py-3 font-medium">Remaining</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-text-light">
                    {records.length === 0
                      ? 'No tracked imports yet. Click "Add Tracking" to start.'
                      : 'No matching records.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{r.list_name}</p>
                      <p className="text-xs text-text-light">{new Date(r.import_date).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.publication_code ? (
                        <span className="inline-block px-2 py-0.5 bg-accent-wash text-accent text-xs font-mono rounded">
                          {r.publication_code}
                        </span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-display text-lg text-navy tabular-nums">
                      {r.imported_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.week1_opens !== null ? (
                        <span className="text-accent font-medium">{r.week1_opens.toLocaleString()}</span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.week2_opens !== null ? (
                        <span className="text-accent font-medium">{r.week2_opens.toLocaleString()}</span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.week3_opens !== null ? (
                        <span className="text-accent font-medium">{r.week3_opens.toLocaleString()}</span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.week4_opens !== null ? (
                        <span className="text-accent font-medium">{r.week4_opens.toLocaleString()}</span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.remaining_subs !== null ? (
                        <span className="font-display text-lg text-navy">{r.remaining_subs.toLocaleString()}</span>
                      ) : (
                        <span className="text-text-light">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 text-xs font-medium rounded-lg ${
                          r.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-accent-wash text-accent'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-text-light hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
