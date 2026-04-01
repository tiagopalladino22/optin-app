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

export default function ImportTrackingPage() {
  const [records, setRecords] = useState<TrackingRecord[]>([])
  const [lists, setLists] = useState<ListmonkList[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [listSearch, setListSearch] = useState('')

  // Form state
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [selectedListName, setSelectedListName] = useState('')
  const [pubCode, setPubCode] = useState('')
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0])
  const [importedCount, setImportedCount] = useState('')
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

  const fetchLists = useCallback(async () => {
    try {
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
    } catch {
      // Lists fetch is optional
    }
  }, [])

  useEffect(() => {
    fetchRecords()
    fetchLists()
  }, [fetchRecords, fetchLists])

  function handleListSelect(listId: number) {
    const list = lists.find((l) => l.id === listId)
    if (list) {
      setSelectedListId(listId)
      setSelectedListName(list.name)
      setImportedCount(String(list.subscriber_count || ''))

      // Auto-detect publication code (first 3 uppercase letters before " - ")
      const match = list.name.match(/^([A-Z]{3})\s*-/)
      if (match) {
        setPubCode(match[1])
      } else {
        setPubCode('')
      }

      // Try to detect date from list name
      const dateMatch = list.name.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
      if (dateMatch) {
        const parts = dateMatch[1].split('/')
        const d = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`)
        if (!isNaN(d.getTime())) {
          setImportDate(d.toISOString().split('T')[0])
        }
      }
    }
  }

  async function handleSave() {
    if (!selectedListId || !selectedListName || !importedCount) {
      setError('Please fill all required fields')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/import-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          list_id: selectedListId,
          list_name: selectedListName,
          publication_code: pubCode || null,
          import_date: importDate,
          imported_count: parseInt(importedCount),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create')
      }

      setSuccess('Tracking started!')
      setShowForm(false)
      setSelectedListId(null)
      setSelectedListName('')
      setPubCode('')
      setImportedCount('')
      setListSearch('')
      fetchRecords()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tracking')
    } finally {
      setSaving(false)
    }
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

  const filteredLists = lists.filter((l) =>
    l.name.toLowerCase().includes(listSearch.toLowerCase())
  )

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Select List</label>
              <input
                type="text"
                placeholder="Search lists..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              />
              {listSearch && (
                <div className="mt-1 max-h-48 overflow-y-auto border border-border-custom rounded-lg bg-white">
                  {filteredLists.slice(0, 20).map((list) => (
                    <button
                      key={list.id}
                      onClick={() => {
                        handleListSelect(list.id)
                        setListSearch('')
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-offwhite transition-colors ${
                        selectedListId === list.id ? 'bg-accent-wash text-accent' : 'text-text-primary'
                      }`}
                    >
                      {list.name}
                      {list.subscriber_count !== undefined && (
                        <span className="text-text-light ml-2">({list.subscriber_count})</span>
                      )}
                    </button>
                  ))}
                  {filteredLists.length === 0 && (
                    <p className="px-3 py-2 text-sm text-text-light">No lists found</p>
                  )}
                </div>
              )}
              {selectedListName && (
                <p className="mt-1 text-sm text-accent font-medium">{selectedListName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Publication Code</label>
              <input
                type="text"
                value={pubCode}
                onChange={(e) => setPubCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
                placeholder="e.g. EIT"
                maxLength={3}
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Import Date</label>
              <input
                type="date"
                value={importDate}
                onChange={(e) => setImportDate(e.target.value)}
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Imported Count</label>
              <input
                type="number"
                value={importedCount}
                onChange={(e) => setImportedCount(e.target.value)}
                placeholder="Number of subscribers"
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !selectedListId || !importedCount}
              className="px-5 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Starting...' : 'Start Tracking'}
            </button>
          </div>
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
              {records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-text-light">
                    No tracked imports yet. Click &quot;Add Tracking&quot; to start.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
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
