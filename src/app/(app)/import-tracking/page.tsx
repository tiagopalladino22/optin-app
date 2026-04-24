'use client'

import { useState, useEffect, useCallback } from 'react'
import { useData } from '@/lib/DataProvider'

interface TrackingRecord {
  id: string
  list_id: number
  list_name: string
  publication_code: string | null
  group_id: string | null
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

interface ImportGroup {
  id: string
  name: string
  sort_order: number
}

interface ListmonkList {
  id: number
  name: string
  subscriber_count?: number
}

export default function ImportTrackingPage() {
  const { selectedInstanceId } = useData()
  const [records, setRecords] = useState<TrackingRecord[]>([])
  const [lists, setLists] = useState<ListmonkList[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [listSearch, setListSearch] = useState('')

  // Form state
  const [selectedLists, setSelectedLists] = useState<Set<number>>(new Set())
  const [formGroupId, setFormGroupId] = useState<string>('')
  const [formNewGroupName, setFormNewGroupName] = useState('')
  const [saving, setSaving] = useState(false)

  const [groups, setGroups] = useState<ImportGroup[]>([])

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

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/import-tracking/groups')
      if (!res.ok) return
      const data = await res.json()
      setGroups(data)
    } catch {
      // optional
    }
  }, [])

  const fetchLists = useCallback(async (instanceId?: string | null) => {
    try {
      const allLists: ListmonkList[] = []
      let page = 1
      const instanceParam = instanceId ? `&instance=${instanceId}` : ''
      while (true) {
        const res = await fetch(`/api/listmonk/lists?per_page=100&page=${page}${instanceParam}`)
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

  // Re-fetch lists when the global instance changes
  useEffect(() => {
    setLists([])
    setSelectedLists(new Set())
    fetchLists(selectedInstanceId)
  }, [selectedInstanceId, fetchLists])

  useEffect(() => {
    fetchRecords()
    fetchGroups()
  }, [fetchRecords, fetchGroups])

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
    // Match 2-8 uppercase letters at start followed by optional whitespace + hyphen
    // Handles "TWS - ..." (3 letters) AND "TWSW - ..." (4+ letters)
    const match = name.match(/^([A-Z]{2,8})\s*-/)
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

    // Resolve the target group: either existing, new, or none
    let targetGroupId: string | null = null
    if (formGroupId === '__new__') {
      const name = formNewGroupName.trim()
      if (!name) {
        setError('Enter a name for the new group')
        setSaving(false)
        return
      }
      try {
        const res = await fetch('/api/import-tracking/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        if (!res.ok) throw new Error()
        const newGroup = await res.json()
        targetGroupId = newGroup.id
        await fetchGroups()
      } catch {
        setError('Failed to create group')
        setSaving(false)
        return
      }
    } else if (formGroupId) {
      targetGroupId = formGroupId
    }

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
            group_id: targetGroupId,
            client_id: selectedInstanceId || null,
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
    setFormGroupId('')
    setFormNewGroupName('')
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
    if (selectedRecords.size === 0) {
      setError('Select the records you want to refresh first')
      return
    }
    setRefreshing(true)
    setError('')
    try {
      const res = await fetch('/api/import-tracking/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedRecords) }),
      })
      if (!res.ok) throw new Error('Failed to refresh')
      const data = await res.json()
      setSuccess(`Snapshots refreshed! ${data.message || ''}`)
      clearSelection()
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingPubId, setEditingPubId] = useState<string | null>(null)
  const [editingPubValue, setEditingPubValue] = useState('')
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())
  const [showGroupMenu, setShowGroupMenu] = useState(false)

  function toggleRecordSelection(id: string) {
    setSelectedRecords((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedRecords(new Set())
    setShowGroupMenu(false)
  }

  async function bulkMoveToGroup(groupId: string | null) {
    const ids = Array.from(selectedRecords)
    if (ids.length === 0) return
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/import-tracking?id=${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId }),
          })
        )
      )
      clearSelection()
      fetchRecords()
    } catch {
      setError('Failed to move lists')
    }
  }

  async function createGroupWithSelection() {
    const name = newGroupName.trim()
    if (!name) return
    try {
      const res = await fetch('/api/import-tracking/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      const newGroup = await res.json()
      await fetchGroups()
      // Move selected records to the new group
      if (selectedRecords.size > 0 && newGroup?.id) {
        await bulkMoveToGroup(newGroup.id)
      }
      setNewGroupName('')
      setShowNewGroup(false)
    } catch {
      setError('Failed to create group')
    }
  }
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupValue, setEditingGroupValue] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function renameGroup(id: string) {
    const name = editingGroupValue.trim()
    if (!name) return
    try {
      const res = await fetch(`/api/import-tracking/groups?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      setEditingGroupId(null)
      setEditingGroupValue('')
      fetchGroups()
    } catch {
      setError('Failed to rename group')
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group? Lists in it will become ungrouped.')) return
    try {
      const res = await fetch(`/api/import-tracking/groups?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      fetchGroups()
      fetchRecords()
    } catch {
      setError('Failed to delete group')
    }
  }


  async function savePubCode(id: string) {
    const newCode = editingPubValue.trim().toUpperCase() || null
    try {
      const res = await fetch(`/api/import-tracking?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publication_code: newCode }),
      })
      if (!res.ok) throw new Error('Failed')
      setEditingPubId(null)
      setEditingPubValue('')
      fetchRecords()
    } catch {
      setError('Failed to update publication code')
    }
  }

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
        <div className="bg-surface rounded-xl border border-border-custom p-6">
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
            disabled={refreshing || selectedRecords.size === 0}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : selectedRecords.size > 0 ? `Refresh ${selectedRecords.size} Selected` : 'Refresh Snapshots'}
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
        <div className="bg-surface rounded-xl border border-border-custom p-6 space-y-4">
          <h3 className="font-display text-xl tracking-wide text-navy uppercase">Track New Import</h3>


          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Group (optional)</label>
            <div className="flex gap-2">
              <select
                value={formGroupId}
                onChange={(e) => setFormGroupId(e.target.value)}
                className="flex-1 border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                <option value="">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="__new__">+ Create new group...</option>
              </select>
              {formGroupId === '__new__' && (
                <input
                  type="text"
                  value={formNewGroupName}
                  onChange={(e) => setFormNewGroupName(e.target.value)}
                  placeholder="New group name"
                  className="flex-1 border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              )}
            </div>
          </div>

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
            <div className="max-h-64 overflow-y-auto border border-border-custom rounded-lg bg-surface">
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
                  ? 'bg-accent text-white'
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

      {/* Bulk action bar (appears when rows are selected) */}
      {selectedRecords.size > 0 && (
        <div className="flex items-center gap-3 bg-accent-wash border border-accent/30 rounded-xl px-4 py-3">
          <span className="text-sm text-accent font-medium">
            {selectedRecords.size} selected
          </span>
          <div className="relative">
            <button
              onClick={() => setShowGroupMenu(!showGroupMenu)}
              className="px-3 py-1.5 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              Add to group
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showGroupMenu && (
              <div className="absolute top-full mt-1 left-0 w-56 bg-surface rounded-lg border border-border-custom shadow-lg z-10 py-1">
                {groups.length > 0 ? (
                  groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => bulkMoveToGroup(g.id)}
                      className="w-full text-left px-3 py-2 text-sm text-navy hover:bg-offwhite transition-colors"
                    >
                      {g.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-text-light italic">No groups yet</p>
                )}
                <div className="border-t border-border-custom my-1" />
                <button
                  onClick={() => {
                    setShowNewGroup(true)
                    setShowGroupMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-offwhite transition-colors"
                >
                  + Create new group
                </button>
                <button
                  onClick={() => bulkMoveToGroup(null)}
                  className="w-full text-left px-3 py-2 text-sm text-text-mid hover:bg-offwhite transition-colors"
                >
                  Remove from group
                </button>
              </div>
            )}
          </div>
          {showNewGroup && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createGroupWithSelection()
                  if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName('') }
                }}
                autoFocus
                placeholder="Group name"
                className="px-2 py-1 border border-border-custom rounded text-sm text-navy focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button onClick={createGroupWithSelection} className="text-accent text-sm px-2" title="Create & assign">✓</button>
              <button
                onClick={() => { setShowNewGroup(false); setNewGroupName('') }}
                className="text-text-light text-sm px-2"
                title="Cancel"
              >✕</button>
            </div>
          )}
          <button
            onClick={clearSelection}
            className="ml-auto text-sm text-text-mid hover:text-navy transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider">
                <th className="w-10 pl-4 pr-2 py-3"></th>
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
                  <td colSpan={11} className="px-4 py-8 text-center text-text-light">
                    {records.length === 0
                      ? 'No tracked imports yet. Click "Add Tracking" to start.'
                      : 'No matching records.'}
                  </td>
                </tr>
              ) : (
                (() => {
                  // Build ordered list of groups to render:
                  // 1. User-defined groups (even if empty) + their records
                  // 2. Ungrouped records at the bottom
                  const recordsByGroup = new Map<string | null, TrackingRecord[]>()
                  for (const r of filteredRecords) {
                    const key = r.group_id
                    if (!recordsByGroup.has(key)) recordsByGroup.set(key, [])
                    recordsByGroup.get(key)!.push(r)
                  }

                  type RenderedGroup = {
                    id: string | null
                    name: string
                    records: TrackingRecord[]
                  }
                  const isFiltering = !!activePubFilter || !!tableSearch
                  const renderOrder: RenderedGroup[] = []
                  for (const g of groups) {
                    const records = recordsByGroup.get(g.id) || []
                    // When filtering, hide empty groups; otherwise show all (incl. empty)
                    if (isFiltering && records.length === 0) continue
                    renderOrder.push({
                      id: g.id,
                      name: g.name,
                      records,
                    })
                  }
                  const ungrouped = recordsByGroup.get(null) || []
                  if (ungrouped.length > 0) {
                    renderOrder.push({ id: null, name: 'Ungrouped', records: ungrouped })
                  }

                  return renderOrder.flatMap((g) => {
                    const groupKey = g.id || 'ungrouped'
                    const isExpanded = expandedGroups.has(groupKey)
                    const totals = g.records.reduce(
                      (acc, r) => ({
                        imported: acc.imported + r.imported_count,
                        w1: acc.w1 + (r.week1_opens || 0),
                        w2: acc.w2 + (r.week2_opens || 0),
                        w3: acc.w3 + (r.week3_opens || 0),
                        w4: acc.w4 + (r.week4_opens || 0),
                        remaining: acc.remaining + (r.remaining_subs || 0),
                      }),
                      { imported: 0, w1: 0, w2: 0, w3: 0, w4: 0, remaining: 0 }
                    )

                    const rows = [
                      <tr
                        key={`group-${groupKey}`}
                        className="border-b border-border-custom bg-offwhite/50 hover:bg-offwhite font-medium"
                      >
                        <td className="w-10 pl-4 pr-2 py-3">
                          {(() => {
                            const groupIds = g.records.map((r) => r.id)
                            const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedRecords.has(id))
                            return (
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => {
                                  setSelectedRecords((prev) => {
                                    const next = new Set(prev)
                                    if (allSelected) {
                                      groupIds.forEach((id) => next.delete(id))
                                    } else {
                                      groupIds.forEach((id) => next.add(id))
                                    }
                                    return next
                                  })
                                }}
                                className="rounded border-border-custom text-accent focus:ring-accent"
                              />
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3" colSpan={2}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleGroup(groupKey)}
                              className="flex items-center"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`text-text-mid transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </button>
                            {g.id && editingGroupId === g.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editingGroupValue}
                                  onChange={(e) => setEditingGroupValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') renameGroup(g.id!)
                                    if (e.key === 'Escape') {
                                      setEditingGroupId(null)
                                      setEditingGroupValue('')
                                    }
                                  }}
                                  autoFocus
                                  className="px-2 py-0.5 border border-border-custom rounded text-sm text-navy focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                                <button onClick={() => renameGroup(g.id!)} className="text-accent text-xs" title="Save">✓</button>
                                <button
                                  onClick={() => { setEditingGroupId(null); setEditingGroupValue('') }}
                                  className="text-text-light text-xs"
                                  title="Cancel"
                                >✕</button>
                              </div>
                            ) : (
                              <>
                                <span className="text-navy">{g.name}</span>
                                <span className="text-xs text-text-light font-normal">
                                  ({g.records.length} list{g.records.length !== 1 ? 's' : ''})
                                </span>
                                {g.id && (
                                  <>
                                    <button
                                      onClick={() => { setEditingGroupId(g.id); setEditingGroupValue(g.name) }}
                                      className="ml-2 text-xs text-text-light hover:text-accent"
                                      title="Rename"
                                    >Rename</button>
                                    <button
                                      onClick={() => deleteGroup(g.id!)}
                                      className="text-xs text-text-light hover:text-red-500"
                                      title="Delete group"
                                    >Delete</button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-display text-base text-navy tabular-nums">
                          {totals.imported.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-accent font-medium">
                          {totals.w1 > 0 ? totals.w1.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-accent font-medium">
                          {totals.w2 > 0 ? totals.w2.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-accent font-medium">
                          {totals.w3 > 0 ? totals.w3.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-accent font-medium">
                          {totals.w4 > 0 ? totals.w4.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-navy font-display text-base">
                          {totals.remaining > 0 ? totals.remaining.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3" colSpan={2}></td>
                      </tr>,
                    ]

                    if (isExpanded) {
                      for (const r of g.records) {
                        rows.push(
                          <tr
                            key={r.id}
                            className={`border-b border-border-custom last:border-0 hover:bg-offwhite/50 transition-colors ${
                              selectedRecords.has(r.id) ? 'bg-accent-wash/40' : ''
                            }`}
                          >
                            <td className="w-10 pl-4 pr-2 py-3">
                              <input
                                type="checkbox"
                                checked={selectedRecords.has(r.id)}
                                onChange={() => toggleRecordSelection(r.id)}
                                className="rounded border-border-custom text-accent focus:ring-accent"
                              />
                            </td>
                            <td className="px-4 py-3 pl-10">
                              <p className="font-medium text-text-primary">{r.list_name}</p>
                              <p className="text-xs text-text-light">
                                {new Date(r.import_date).toLocaleDateString()}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              {editingPubId === r.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingPubValue}
                                    onChange={(e) => setEditingPubValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') savePubCode(r.id)
                                      if (e.key === 'Escape') {
                                        setEditingPubId(null)
                                        setEditingPubValue('')
                                      }
                                    }}
                                    autoFocus
                                    className="w-16 px-1.5 py-0.5 border border-border-custom rounded text-xs font-mono text-navy focus:outline-none focus:ring-1 focus:ring-accent"
                                    placeholder="TWSW"
                                  />
                                  <button
                                    onClick={() => savePubCode(r.id)}
                                    className="text-accent hover:text-accent-bright text-xs"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingPubId(null)
                                      setEditingPubValue('')
                                    }}
                                    className="text-text-light hover:text-text-mid text-xs"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingPubId(r.id)
                                    setEditingPubValue(r.publication_code || '')
                                  }}
                                  className="inline-block px-2 py-0.5 bg-accent-wash text-accent text-xs font-mono rounded hover:bg-accent/20 transition-colors"
                                  title="Click to edit"
                                >
                                  {r.publication_code || '+ add'}
                                </button>
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
                        )
                      }
                    }

                    return rows
                  })
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
