'use client'

import { useEffect, useState } from 'react'

interface Publication {
  id: string
  client_id: string | null
  code: string
  name: string
  created_at: string
}

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

  useEffect(() => {
    fetchPublications()
  }, [])

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()

    const upperCode = code.toUpperCase()
    if (!/^[A-Z]{3}$/.test(upperCode)) {
      setError('Code must be exactly 3 uppercase letters')
      return
    }
    if (!name.trim()) {
      setError('Name is required')
      return
    }

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
      setCode('')
      setName('')
      setShowForm(false)
      setSuccess('Publication created successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create publication')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(pub: Publication) {
    if (!confirm(`Delete publication "${pub.code} — ${pub.name}"?`)) return
    clearMessages()
    setDeleting(pub.id)
    try {
      const res = await fetch('/api/publications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pub.id }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setPublications((prev) => prev.filter((p) => p.id !== pub.id))
      setSuccess('Publication deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(null)
    }
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
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Publications</h1>
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-surface rounded-xl border border-border-custom p-6">
          <form onSubmit={handleSubmit} className="flex items-end gap-4">
            <div className="flex-shrink-0">
              <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
                Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
                placeholder="ABC"
                maxLength={3}
                className="w-24 px-3 py-2 border border-border-custom rounded-lg text-navy font-mono text-center tracking-widest placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Publication name"
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                required
              />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setCode(''); setName(''); clearMessages() }}
                className="px-4 py-2 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {publications.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">No publications yet.</p>
          <p className="text-sm text-text-light mt-2">
            Add 3-letter publication codes to organize your content.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-custom bg-offwhite">
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Code</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
                <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((pub) => (
                <tr key={pub.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                  <td className="px-4 py-3">
                    <span className="inline-block bg-offwhite text-navy font-mono text-xs font-semibold tracking-widest rounded px-2 py-1">
                      {pub.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-navy font-medium">
                    {pub.name}
                  </td>
                  <td className="px-4 py-3 text-text-light">
                    {new Date(pub.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(pub)}
                      disabled={deleting === pub.id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {deleting === pub.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
