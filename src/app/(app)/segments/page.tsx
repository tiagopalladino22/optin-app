'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Segment {
  id: string
  name: string
  description: string | null
  logic: string
  rules: unknown[]
  subscriber_count: number
  exported_list_id: number | null
  last_run_at: string | null
  created_at: string
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function fetchSegments() {
    try {
      const res = await fetch('/api/segments')
      const data = await res.json()
      setSegments(data.data || [])
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSegments()
  }, [])

  async function handleDelete(seg: Segment) {
    if (!confirm(`Delete segment "${seg.name}"?`)) return
    setDeleting(seg.id)
    try {
      const res = await fetch('/api/segments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: seg.id }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setSegments((prev) => prev.filter((s) => s.id !== seg.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
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
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Segments</h1>
        <Link
          href="/segments/new"
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors"
        >
          Create Segment
        </Link>
      </div>

      {segments.length === 0 ? (
        <div className="bg-white rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">No segments yet.</p>
          <p className="text-sm text-text-light mt-2">
            Create audience segments based on subscriber data and engagement activity.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-custom bg-offwhite">
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Rules</th>
                <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Subscribers</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Exported</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
                <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg) => (
                <tr key={seg.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                  <td className="px-4 py-3">
                    <Link href={`/segments/${seg.id}`} className="text-accent hover:text-accent-bright font-medium">
                      {seg.name}
                    </Link>
                    {seg.description && (
                      <p className="text-xs text-text-light mt-0.5">{seg.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {seg.rules.length} rule{seg.rules.length !== 1 ? 's' : ''}
                    <span className="ml-1 inline-block bg-offwhite text-text-mid uppercase rounded-lg px-1.5 py-0.5 text-xs font-medium">
                      {seg.logic}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-navy tabular-nums">
                    {seg.subscriber_count > 0 ? seg.subscriber_count.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {seg.exported_list_id ? (
                      <span className="inline-block bg-emerald-50 text-emerald-700 rounded-lg px-2 py-0.5 text-xs font-medium">
                        List #{seg.exported_list_id}
                      </span>
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-light">
                    {new Date(seg.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/segments/${seg.id}`} className="text-xs text-text-light hover:text-accent font-medium">
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(seg)}
                        disabled={deleting === seg.id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        {deleting === seg.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
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
