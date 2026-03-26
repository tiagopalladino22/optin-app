'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SegmentRuleEditor, { type SegmentRule } from '@/components/segments/SegmentRuleEditor'
import { useData } from '@/lib/DataProvider'

interface Publication {
  id: string
  code: string
  name: string
}

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

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Sao_Paulo', label: 'Brasilia (America/Sao_Paulo)' },
  { value: 'Europe/London', label: 'London (Europe/London)' },
  { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' },
  { value: 'UTC', label: 'UTC' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const period = i >= 12 ? 'PM' : 'AM'
  const display = i === 0 ? 12 : i > 12 ? i - 12 : i
  return { value: i, label: `${display}:00 ${period}` }
})

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const ACTION_OPTIONS = [
  { value: 'store_data', label: 'Store metrics snapshot', description: 'Save subscriber metrics data for this segment.' },
  { value: 'export_csv', label: 'Export CSV', description: 'Generate a CSV export of matching subscribers.' },
  { value: 'delete_subscribers', label: 'Delete matching subscribers', description: '', warning: 'This will permanently remove matching subscribers from your lists.' },
  { value: 'store_count', label: 'Store subscriber count', description: 'Track subscriber count over time.' },
]

export default function NewAutomationPage() {
  const router = useRouter()
  const { lists: allLists } = useData()
  const [name, setName] = useState('')
  const [publicationId, setPublicationId] = useState('')
  const [publications, setPublications] = useState<Publication[]>([])
  const [pubsLoading, setPubsLoading] = useState(true)

  const [rules, setRules] = useState<SegmentRule[]>([
    { id: '1', field: '', operator: '', value: '' },
  ])
  const [logic, setLogic] = useState<'and' | 'or'>('and')

  const [scheduleDay, setScheduleDay] = useState(3)
  const [scheduleHour, setScheduleHour] = useState(19)
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York')

  const [actions, setActions] = useState<string[]>([])

  const [cohortEnabled, setCohortEnabled] = useState(false)
  const [cohortWeeks, setCohortWeeks] = useState(4)

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPubs() {
      try {
        const res = await fetch('/api/publications')
        const data = await res.json()
        setPublications(data.data || [])
      } catch {
        // ignore
      } finally {
        setPubsLoading(false)
      }
    }
    fetchPubs()
  }, [])

  const validRules = rules.filter((r) => {
    if (!r.field) return false
    if (r.field === 'from_lists') return !!r.value
    return r.operator && r.value
  })
  const canPreview = validRules.length > 0
  const canSave = name.trim() && validRules.length > 0

  function toggleAction(action: string) {
    setActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    )
  }

  async function handlePreview() {
    setPreviewing(true)
    setError(null)
    setPreview(null)
    try {
      // Resolve "all" lists to actual IDs based on publication code
      const pubCode = publications.find((p) => p.id === publicationId)?.code?.toUpperCase()
      const resolvedRules = validRules.map((r) => {
        if (r.field === 'from_lists' && r.value === 'all' && pubCode) {
          const matchingIds = allLists
            .filter((l) => l.name.toUpperCase().startsWith(pubCode))
            .map((l) => l.id)
          return { ...r, value: matchingIds.join(','), operator: 'in' }
        }
        return r
      })

      const res = await fetch('/api/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: resolvedRules, logic }),
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

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          publication_id: publicationId || null,
          rules: validRules,
          logic,
          schedule_day: scheduleDay,
          schedule_hour: scheduleHour,
          schedule_timezone: scheduleTimezone,
          actions,
          cohort_weeks: cohortEnabled ? cohortWeeks : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      router.push('/automations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/automations" className="text-sm text-text-light hover:text-text-mid mb-1 block">
          &larr; Back to Automations
        </Link>
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Create Automation</h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Card 1 — Basic Info */}
      <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase">Basic Info</h2>
        <div>
          <label className="block text-sm font-medium text-text-mid mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekly inactive cleanup"
            className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-mid mb-1">Publication</label>
          {pubsLoading ? (
            <div className="skeleton h-9 w-full" />
          ) : (
            <select
              value={publicationId}
              onChange={(e) => setPublicationId(e.target.value)}
              className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              <option value="">— Select publication (optional) —</option>
              {publications.map((pub) => (
                <option key={pub.id} value={pub.id}>
                  [{pub.code}] {pub.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Card 2 — Filter Rules */}
      <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase">Filter Rules</h2>
        <SegmentRuleEditor
          rules={rules}
          logic={logic}
          onChange={setRules}
          onLogicChange={setLogic}
          publicationCode={publications.find((p) => p.id === publicationId)?.code}
        />
        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {previewing ? 'Previewing...' : 'Preview'}
        </button>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
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
                        {sub.lists?.join(', ') || '—'}
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

      {/* Card 3 — Schedule */}
      <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase">Schedule</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Day of Week</label>
            <select
              value={scheduleDay}
              onChange={(e) => setScheduleDay(Number(e.target.value))}
              className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Time</label>
            <select
              value={scheduleHour}
              onChange={(e) => setScheduleHour(Number(e.target.value))}
              className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Timezone</label>
            <select
              value={scheduleTimezone}
              onChange={(e) => setScheduleTimezone(e.target.value)}
              className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Card 4 — Actions */}
      <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase">Actions</h2>
        <div className="space-y-3">
          {ACTION_OPTIONS.map((opt) => {
            const isSelected = actions.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleAction(opt.value)}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent-wash'
                    : 'border-border-custom bg-white hover:bg-offwhite/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-accent bg-accent' : 'border-border-custom'
                    }`}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-navy'}`}>
                      {opt.label}
                    </p>
                    {opt.description && (
                      <p className="text-xs text-text-light mt-0.5">{opt.description}</p>
                    )}
                  </div>
                </div>
                {isSelected && opt.warning && (
                  <div className="mt-3 ml-8 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {opt.warning}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Card 5 — Cohort Tracking */}
      <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
        <h2 className="font-display text-xl tracking-wide text-navy uppercase">Cohort Tracking</h2>
        <button
          type="button"
          onClick={() => setCohortEnabled(!cohortEnabled)}
          className={`w-full text-left rounded-lg border p-4 transition-colors ${
            cohortEnabled
              ? 'border-accent bg-accent-wash'
              : 'border-border-custom bg-white hover:bg-offwhite/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                cohortEnabled ? 'border-accent bg-accent' : 'border-border-custom'
              }`}
            >
              {cohortEnabled && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <p className={`text-sm font-medium ${cohortEnabled ? 'text-accent' : 'text-navy'}`}>
              Enable cohort tracking
            </p>
          </div>
        </button>
        {cohortEnabled && (
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Track over X weeks</label>
            <input
              type="number"
              value={cohortWeeks}
              onChange={(e) => setCohortWeeks(Number(e.target.value))}
              min={1}
              max={52}
              className="block w-32 border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <p className="text-xs text-text-light mt-2">
              Takes weekly snapshots. On the final week, keeps openers and deletes non-openers.
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Create Automation'}
        </button>
        <Link
          href="/automations"
          className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-white rounded-lg"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
