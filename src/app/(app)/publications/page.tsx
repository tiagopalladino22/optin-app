'use client'

import { useEffect, useState } from 'react'

interface Publication {
  id: string
  client_id: string | null
  code: string
  name: string
  growth_client_id: string | null
  sync_grouping: 'issue_number' | 'week' | 'day'
  sync_send_days: string[]
  sync_enabled: boolean
  sync_match_by: 'code' | 'name'
  created_at: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const GROUPING_OPTIONS = [
  { value: 'issue_number', label: 'By issue number', desc: 'Groups all sends with the same Issue #N into one entry' },
  { value: 'week', label: 'By week', desc: 'Groups all sends within the same week into one entry' },
  { value: 'day', label: 'By day', desc: 'Each send date is a separate entry' },
]

export default function PublicationsPage() {
  const [publications, setPublications] = useState<Publication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingPub, setSyncingPub] = useState<string | null>(null)

  async function fetchPublications() {
    try {
      const res = await fetch('/api/publications')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPublications(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch publications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPublications() }, [])

  function clearMessages() { setError(null); setSuccess(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    const upperCode = code.toUpperCase()
    if (!/^[A-Z]{2,5}$/.test(upperCode)) {
      setError('Code must be 2-5 uppercase letters')
      return
    }
    if (!name.trim()) { setError('Name is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: upperCode, name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPublications((prev) => [data.data, ...prev])
      setCode(''); setName(''); setShowForm(false)
      setSuccess('Publication created')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  async function updatePub(id: string, updates: Partial<Publication>) {
    clearMessages()
    try {
      const res = await fetch('/api/publications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPublications((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.data } : p)))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
      return false
    }
  }

  async function handleDelete(pub: Publication) {
    if (!confirm(`Delete "${pub.code} — ${pub.name}"?`)) return
    clearMessages(); setDeleting(pub.id)
    try {
      const res = await fetch('/api/publications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pub.id }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setPublications((prev) => prev.filter((p) => p.id !== pub.id))
      setSuccess('Deleted'); setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setDeleting(null) }
  }

  async function handleSyncAll() {
    clearMessages(); setSyncing(true)
    try {
      const res = await fetch('/api/sync/campaign-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSuccess(`Sync complete: ${data.message || ''}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally { setSyncing(false) }
  }

  async function handleSyncOne(pub: Publication) {
    clearMessages(); setSyncingPub(pub.id)
    try {
      const res = await fetch('/api/sync/campaign-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publication_code: pub.code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSuccess(`${pub.code}: ${data.message || 'Synced'}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally { setSyncingPub(null) }
  }

  function toggleDay(pub: Publication, day: string) {
    const current = pub.sync_send_days || []
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day]
    updatePub(pub.id, { sync_send_days: next } as Partial<Publication>)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Publications</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncing || publications.filter((p) => p.growth_client_id).length === 0}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync All to 150growth'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); clearMessages() }}
            className={showForm
              ? 'px-4 py-2 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors'
              : 'px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors'
            }
          >
            {showForm ? 'Cancel' : 'Add Publication'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">{success}</div>}

      {showForm && (
        <div className="bg-surface rounded-xl border border-border-custom p-6">
          <form onSubmit={handleSubmit} className="flex items-end gap-4">
            <div className="flex-shrink-0">
              <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                placeholder="ABC"
                maxLength={5}
                className="w-24 px-3 py-2 border border-border-custom rounded-lg text-navy font-mono text-center tracking-widest placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Publication name"
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                required
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>
      )}

      {publications.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">No publications yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publications.map((pub) => {
            const isExpanded = expandedId === pub.id
            const isMapped = !!pub.growth_client_id

            return (
              <div key={pub.id} className="bg-surface rounded-xl border border-border-custom overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-offwhite/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : pub.id)}
                >
                  <span className="inline-block bg-offwhite text-navy font-mono text-xs font-semibold tracking-widest rounded px-2.5 py-1">
                    {pub.code}
                  </span>
                  <span className="font-medium text-text-primary flex-1">{pub.name}</span>

                  {isMapped && (
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                      pub.sync_enabled
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-offwhite text-text-light'
                    }`}>
                      {pub.sync_enabled ? 'Auto-sync on' : 'Sync off'}
                    </span>
                  )}

                  {isMapped && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSyncOne(pub) }}
                      disabled={syncingPub === pub.id}
                      className="text-xs text-accent hover:text-accent-bright font-medium disabled:opacity-50"
                    >
                      {syncingPub === pub.id ? 'Syncing...' : 'Sync now'}
                    </button>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(pub) }}
                    disabled={deleting === pub.id}
                    className="text-xs text-text-light hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>

                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-text-light transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Expanded settings */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-border-custom space-y-5">
                    {/* 150growth Client ID */}
                    <div>
                      <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
                        150growth Client ID
                      </label>
                      <input
                        type="text"
                        defaultValue={pub.growth_client_id || ''}
                        placeholder="Paste the client UUID from 150growth"
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (val !== (pub.growth_client_id || '')) {
                            updatePub(pub.id, { growth_client_id: val || null } as Partial<Publication>)
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-full max-w-md px-3 py-2 border border-border-custom rounded-lg text-navy font-mono text-xs placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>

                    {/* Sync settings — only show if mapped */}
                    {isMapped && (
                      <>
                        {/* Match by */}
                        <div>
                          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-2">
                            Campaign Name Matching
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updatePub(pub.id, { sync_match_by: 'code' } as Partial<Publication>)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                pub.sync_match_by === 'code' || !pub.sync_match_by
                                  ? 'bg-accent text-white'
                                  : 'bg-offwhite text-text-mid hover:bg-border-custom'
                              }`}
                            >
                              By code ({pub.code})
                            </button>
                            <button
                              onClick={() => updatePub(pub.id, { sync_match_by: 'name' } as Partial<Publication>)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                pub.sync_match_by === 'name'
                                  ? 'bg-accent text-white'
                                  : 'bg-offwhite text-text-mid hover:bg-border-custom'
                              }`}
                            >
                              By name ({pub.name})
                            </button>
                          </div>
                          <p className="text-xs text-text-light mt-1.5">
                            {pub.sync_match_by === 'name'
                              ? `Campaigns starting with "${pub.name}" will be matched (e.g., "${pub.name} - Issue #1 - ...")`
                              : `Campaigns starting with "${pub.code}" will be matched (e.g., "${pub.code} - Issue #1 - ...")`
                            }
                          </p>
                        </div>

                        {/* Grouping */}
                        <div>
                          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-2">
                            Campaign Grouping
                          </label>
                          <div className="flex gap-2">
                            {GROUPING_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => updatePub(pub.id, { sync_grouping: opt.value } as Partial<Publication>)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                  pub.sync_grouping === opt.value
                                    ? 'bg-accent text-white'
                                    : 'bg-offwhite text-text-mid hover:bg-border-custom'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-text-light mt-1.5">
                            {GROUPING_OPTIONS.find((o) => o.value === pub.sync_grouping)?.desc}
                          </p>
                        </div>

                        {/* Send days */}
                        <div>
                          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-2">
                            Send Days
                          </label>
                          <div className="flex gap-1.5">
                            {DAYS.map((day) => (
                              <button
                                key={day}
                                onClick={() => toggleDay(pub, day)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  (pub.sync_send_days || []).includes(day)
                                    ? 'bg-accent text-white'
                                    : 'bg-offwhite text-text-mid hover:bg-border-custom'
                                }`}
                              >
                                {day.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Auto-sync toggle */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updatePub(pub.id, { sync_enabled: !pub.sync_enabled } as Partial<Publication>)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              pub.sync_enabled ? 'bg-accent' : 'bg-border-custom'
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface shadow transition-transform ${
                              pub.sync_enabled ? 'translate-x-5' : ''
                            }`} />
                          </button>
                          <span className="text-sm text-text-mid">
                            Auto-sync campaigns to 150growth daily
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
