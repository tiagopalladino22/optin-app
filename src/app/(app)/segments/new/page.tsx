'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SegmentRuleEditor, { type SegmentRule } from '@/components/segments/SegmentRuleEditor'
import { useData } from '@/lib/DataProvider'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

interface PreviewResult {
  count: number
  sample: {
    email: string
    name: string
    attribs: Record<string, unknown>
    lists: string[]
    created_at: string
  }[]
}

export default function NewSegmentPage() {
  const router = useRouter()
  const { selectedInstanceId } = useData()
  useEffect(() => {
    if (DEMO_MODE) router.replace('/segments')
  }, [router])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState<SegmentRule[]>([
    { id: '1', field: '', operator: '', value: '' },
  ])
  const [logic, setLogic] = useState<'and' | 'or'>('and')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savedSegmentId, setSavedSegmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<{
    listId: number
    listName: string
    subscriberCount: number
  } | null>(null)

  const validRules = rules.filter((r) => {
    if (!r.field) return false
    if (r.field === 'from_lists') return !!r.value // lists selected
    return r.operator && r.value
  })
  const canPreview = validRules.length > 0
  const canSave = name.trim() && canPreview

  const handlePreview = async () => {
    setPreviewing(true)
    setError(null)
    setPreview(null)

    try {
      const res = await fetch('/api/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: validRules, logic, instanceId: selectedInstanceId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')

      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          rules: validRules,
          logic,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setSavedSegmentId(data.data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    if (!savedSegmentId) return
    setExporting(true)
    setError(null)

    try {
      const res = await fetch(`/api/segments/${savedSegmentId}/export`, {
        method: 'POST',
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Export failed')

      setExportResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/segments" className="text-sm text-text-light hover:text-text-mid mb-1 block">
          &larr; Back to Segments
        </Link>
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Create Segment</h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Name & Description */}
      <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-mid mb-1">Segment Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enterprise warm leads"
            className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-mid mb-1">
            Description <span className="text-text-light">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of this segment"
            className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      {/* Filter Rules */}
      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <h2 className="text-sm font-medium text-text-mid mb-3">Filter Rules</h2>
        <SegmentRuleEditor
          rules={rules}
          logic={logic}
          onChange={setRules}
          onLogicChange={setLogic}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg disabled:opacity-50 transition-colors"
        >
          {previewing ? 'Previewing...' : 'Preview Segment'}
        </button>

        {!savedSegmentId && (
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Segment'}
          </button>
        )}

        {savedSegmentId && !exportResult && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export to Listmonk List'}
          </button>
        )}
      </div>

      {/* Saved confirmation */}
      {savedSegmentId && !exportResult && (
        <div className="p-3 bg-accent-wash border border-accent-border rounded-xl text-sm text-accent">
          Segment saved. You can now export it to create a Listmonk list with matching subscribers.
        </div>
      )}

      {/* Export Result */}
      {exportResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-sm font-medium text-emerald-800">Export Complete</p>
          <p className="text-sm text-emerald-700 mt-1">
            Created list &quot;{exportResult.listName}&quot; with{' '}
            <span className="font-medium">{exportResult.subscriberCount}</span> subscribers.
          </p>
          <button
            onClick={() => router.push('/segments')}
            className="mt-3 text-sm text-emerald-700 underline hover:text-emerald-900"
          >
            Back to Segments
          </button>
        </div>
      )}

      {/* Preview Results */}
      {preview && (
        <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-mid">Preview Results</h2>
            <span className="text-sm font-medium text-navy">
              {preview.count} subscriber{preview.count !== 1 ? 's' : ''} matched
            </span>
          </div>

          {preview.sample.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-custom bg-offwhite">
                    <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Email</th>
                    <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Lists</th>
                    <th className="text-left py-2 text-text-light uppercase text-xs tracking-wider font-medium">Attributes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((sub, i) => (
                    <tr key={i} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                      <td className="py-2 pr-4 text-navy">{sub.email}</td>
                      <td className="py-2 pr-4 text-text-mid">{sub.name || '—'}</td>
                      <td className="py-2 pr-4 text-text-light text-xs">
                        {sub.lists.join(', ') || '—'}
                      </td>
                      <td className="py-2 text-text-light text-xs font-mono">
                        {Object.keys(sub.attribs || {}).length > 0
                          ? JSON.stringify(sub.attribs).slice(0, 60)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-light">No subscribers match these rules.</p>
          )}
        </div>
      )}
    </div>
  )
}
