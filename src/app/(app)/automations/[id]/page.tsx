'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SegmentRuleEditor, { type SegmentRule } from '@/components/segments/SegmentRuleEditor'
import { useData } from '@/lib/DataProvider'

interface Publication {
  id: string
  code: string
  name: string
}

interface AutomationRun {
  id: string
  run_at: string
  status: string
  action_taken: string | null
  subscribers_processed: number
  subscribers_deleted: number
  subscribers_kept: number
  details: Record<string, unknown> | null
}

interface AutomationSnapshot {
  id: string
  snapshot_date: string
  week_number: number
  total_subscribers: number
  unique_openers: number
  non_openers: number
  kept_count: number
  deleted_count: number
  list_name: string | null
  publication_code: string
}

interface Automation {
  id: string
  name: string
  publication_id: string | null
  publication: Publication | null
  schedule_day: number
  schedule_hour: number
  schedule_timezone: string
  rules: SegmentRule[]
  logic: 'and' | 'or'
  actions: string[]
  cohort_weeks: number | null
  is_active: boolean
  created_at: string
  runs: AutomationRun[]
  snapshots: AutomationSnapshot[]
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TZ_ABBRS: Record<string, string> = {
  'America/New_York': 'EST',
  'America/Chicago': 'CST',
  'America/Denver': 'MST',
  'America/Los_Angeles': 'PST',
  'America/Sao_Paulo': 'BRT',
  'Europe/London': 'GMT',
  'Europe/Berlin': 'CET',
  UTC: 'UTC',
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

function formatSchedule(day: number, hour: number, timezone: string) {
  const dayName = DAY_NAMES[day] || `Day ${day}`
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const tzAbbr = TZ_ABBRS[timezone] || timezone
  return `${dayName} ${displayHour}:00 ${period} ${tzAbbr}`
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700'
    case 'failed':
      return 'bg-red-50 text-red-600'
    case 'running':
      return 'bg-accent-wash text-accent'
    case 'pending':
    default:
      return 'bg-offwhite text-text-mid'
  }
}

export default function AutomationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { lists: allLists } = useData()
  const [automation, setAutomation] = useState<Automation | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editPublicationId, setEditPublicationId] = useState('')
  const [editRules, setEditRules] = useState<SegmentRule[]>([])
  const [editLogic, setEditLogic] = useState<'and' | 'or'>('and')
  const [editScheduleDay, setEditScheduleDay] = useState(0)
  const [editScheduleHour, setEditScheduleHour] = useState(0)
  const [editScheduleTimezone, setEditScheduleTimezone] = useState('America/New_York')
  const [editActions, setEditActions] = useState<string[]>([])
  const [editCohortEnabled, setEditCohortEnabled] = useState(false)
  const [editCohortWeeks, setEditCohortWeeks] = useState(4)

  // Publications for edit form
  const [publications, setPublications] = useState<Publication[]>([])
  const [pubsLoading, setPubsLoading] = useState(false)

  // Preview in edit mode
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const fetchAutomation = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${params.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAutomation(data.data)
      populateEditForm(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automation')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  function populateEditForm(auto: Automation) {
    setEditName(auto.name)
    setEditPublicationId(auto.publication_id || '')
    setEditRules(auto.rules || [])
    setEditLogic(auto.logic || 'and')
    setEditScheduleDay(auto.schedule_day)
    setEditScheduleHour(auto.schedule_hour)
    setEditScheduleTimezone(auto.schedule_timezone)
    setEditActions(auto.actions || [])
    setEditCohortEnabled(!!auto.cohort_weeks)
    setEditCohortWeeks(auto.cohort_weeks || 4)
  }

  useEffect(() => {
    fetchAutomation()
  }, [fetchAutomation])

  function startEditing() {
    setEditing(true)
    setPubsLoading(true)
    fetch('/api/publications')
      .then((res) => res.json())
      .then((data) => setPublications(data.data || []))
      .catch(() => {})
      .finally(() => setPubsLoading(false))
  }

  function cancelEditing() {
    setEditing(false)
    setPreview(null)
    if (automation) populateEditForm(automation)
  }

  function toggleEditAction(action: string) {
    setEditActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    )
  }

  const editValidRules = editRules.filter((r) => {
    if (!r.field) return false
    if (r.field === 'from_lists') return !!r.value
    return r.operator && r.value
  })

  async function handlePreview() {
    setPreviewing(true)
    setError(null)
    setPreview(null)
    try {
      // Resolve "all" lists to actual IDs based on publication code
      const pubCode = (publications.find((p) => p.id === editPublicationId)?.code || automation?.publication?.code)?.toUpperCase()
      const resolvedRules = editValidRules.map((r) => {
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
        body: JSON.stringify({ rules: resolvedRules, logic: editLogic }),
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
    setSuccess(null)
    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.id,
          name: editName.trim(),
          publication_id: editPublicationId || null,
          rules: editValidRules,
          logic: editLogic,
          schedule_day: editScheduleDay,
          schedule_hour: editScheduleHour,
          schedule_timezone: editScheduleTimezone,
          actions: editActions,
          cohort_weeks: editCohortEnabled ? editCohortWeeks : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Refetch to get full data with runs/snapshots
      setEditing(false)
      setPreview(null)
      setSuccess('Automation updated')
      await fetchAutomation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this automation? This cannot be undone.')) return
    try {
      const res = await fetch('/api/automations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: params.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      router.push('/automations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function handleRunNow() {
    if (!confirm('Run this automation now? This will execute all configured actions immediately.')) return
    setRunning(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/automations/${params.id}/run`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Run failed')
      setSuccess('Automation run completed')
      await fetchAutomation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setRunning(false)
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

  if (!automation) {
    return <p className="text-text-mid">Automation not found.</p>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/automations" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Automations
          </Link>
          {!editing && (
            <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{automation.name}</h1>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunNow}
              disabled={running}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 transition-colors"
            >
              {running ? 'Running...' : 'Run Now'}
            </button>
            <button
              onClick={startEditing}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-white rounded-lg"
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
          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">Basic Info</h2>
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Publication</label>
              {pubsLoading ? (
                <div className="skeleton h-9 w-full" />
              ) : (
                <select
                  value={editPublicationId}
                  onChange={(e) => setEditPublicationId(e.target.value)}
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

          {/* Filter Rules */}
          <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">Filter Rules</h2>
            <SegmentRuleEditor
              rules={editRules}
              logic={editLogic}
              onChange={setEditRules}
              onLogicChange={setEditLogic}
              publicationCode={publications.find((p) => p.id === editPublicationId)?.code || automation?.publication?.code}
            />
            <button
              onClick={handlePreview}
              disabled={editValidRules.length === 0 || previewing}
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

          {/* Schedule */}
          <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">Schedule</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">Day of Week</label>
                <select
                  value={editScheduleDay}
                  onChange={(e) => setEditScheduleDay(Number(e.target.value))}
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
                  value={editScheduleHour}
                  onChange={(e) => setEditScheduleHour(Number(e.target.value))}
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
                  value={editScheduleTimezone}
                  onChange={(e) => setEditScheduleTimezone(e.target.value)}
                  className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">Actions</h2>
            <div className="space-y-3">
              {ACTION_OPTIONS.map((opt) => {
                const isSelected = editActions.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleEditAction(opt.value)}
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

          {/* Cohort Tracking */}
          <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
            <h2 className="font-display text-xl tracking-wide text-navy uppercase">Cohort Tracking</h2>
            <button
              type="button"
              onClick={() => setEditCohortEnabled(!editCohortEnabled)}
              className={`w-full text-left rounded-lg border p-4 transition-colors ${
                editCohortEnabled
                  ? 'border-accent bg-accent-wash'
                  : 'border-border-custom bg-white hover:bg-offwhite/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    editCohortEnabled ? 'border-accent bg-accent' : 'border-border-custom'
                  }`}
                >
                  {editCohortEnabled && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <p className={`text-sm font-medium ${editCohortEnabled ? 'text-accent' : 'text-navy'}`}>
                  Enable cohort tracking
                </p>
              </div>
            </button>
            {editCohortEnabled && (
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">Track over X weeks</label>
                <input
                  type="number"
                  value={editCohortWeeks}
                  onChange={(e) => setEditCohortWeeks(Number(e.target.value))}
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

          {/* Save / Cancel */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={cancelEditing}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* View Mode */}
      {!editing && (
        <>
          {/* Info Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Publication</p>
              <p className="font-display text-3xl text-navy">
                {automation.publication ? (
                  <span className="inline-block px-2 py-0.5 rounded-lg text-sm font-medium bg-offwhite text-text-mid">
                    {automation.publication.code}
                  </span>
                ) : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Schedule</p>
              <p className="text-sm font-medium text-navy mt-1">
                {formatSchedule(automation.schedule_day, automation.schedule_hour, automation.schedule_timezone)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Status</p>
              <p className="mt-1">
                <span
                  className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${
                    automation.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-offwhite text-text-mid'
                  }`}
                >
                  {automation.is_active ? 'Active' : 'Paused'}
                </span>
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border-custom p-4">
              <p className="text-xs text-text-light uppercase tracking-wider mb-1">Total Runs</p>
              <p className="font-display text-3xl text-navy">{automation.runs.length}</p>
            </div>
          </div>

          {/* Run History */}
          <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
            <div className="px-5 py-4 border-b border-border-custom">
              <h2 className="font-display text-xl tracking-wide text-navy uppercase">Run History</h2>
            </div>
            {automation.runs.length === 0 ? (
              <div className="p-8 text-center text-text-light text-sm">
                No runs yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Processed</th>
                      <th className="text-right px-4 py-3 font-medium">Deleted</th>
                      <th className="text-right px-4 py-3 font-medium">Kept</th>
                      <th className="text-right px-4 py-3 font-medium">CSV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automation.runs.map((run) => (
                      <tr key={run.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                        <td className="px-4 py-3 text-navy">
                          {new Date(run.run_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${statusBadgeClass(run.status)}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {run.subscribers_processed?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {run.subscribers_deleted?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {run.subscribers_kept?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {run.details && (run.details as Record<string, unknown>).csv ? (
                            <button
                              onClick={() => {
                                const csv = (run.details as Record<string, unknown>).csv as string
                                const blob = new Blob([csv], { type: 'text/csv' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `automation-${automation.name}-${new Date(run.run_at).toISOString().slice(0, 10)}.csv`
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                              className="text-xs text-accent hover:text-accent-bright font-medium"
                            >
                              Download
                            </button>
                          ) : (
                            <span className="text-text-light text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Snapshots */}
          {automation.snapshots.length > 0 && (
            <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
              <div className="px-5 py-4 border-b border-border-custom">
                <h2 className="font-display text-xl tracking-wide text-navy uppercase">Snapshots</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-right px-4 py-3 font-medium">Week #</th>
                      <th className="text-right px-4 py-3 font-medium">Total Subs</th>
                      <th className="text-right px-4 py-3 font-medium">Unique Openers</th>
                      <th className="text-right px-4 py-3 font-medium">Non-Openers</th>
                      <th className="text-right px-4 py-3 font-medium">Kept</th>
                      <th className="text-right px-4 py-3 font-medium">Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automation.snapshots.map((snap) => (
                      <tr key={snap.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                        <td className="px-4 py-3 text-navy">
                          {new Date(snap.snapshot_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.week_number}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.total_subscribers?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.unique_openers?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.non_openers?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.kept_count?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                          {snap.deleted_count?.toLocaleString() ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
