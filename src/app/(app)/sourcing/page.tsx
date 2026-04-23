'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ChipInput from '@/components/sourcing/ChipInput'
import TypeaheadChipInput from '@/components/sourcing/TypeaheadChipInput'
import ChipToggle from '@/components/sourcing/ChipToggle'
import DepartmentPicker from '@/components/sourcing/DepartmentPicker'
import {
  APOLLO_SENIORITIES,
  APOLLO_EMPLOYEE_RANGES,
  SlotFilters,
  hasAnyFilter,
} from '@/lib/apollo'
import { APOLLO_INDUSTRIES } from '@/lib/apollo-industries'
import { departmentLabel } from '@/lib/apollo-departments'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// Placeholder values — wire these to real per-client data later.
const PLACEHOLDER_WEEKLY_TARGET = 8000
const PLACEHOLDER_LAST_WEEK_RECEIVED = 7450

interface Slot {
  id: string | null
  week_id: string
  slot_number: number
  filters: SlotFilters
  net_new_count: number | null
  requested_count: number | null
  status: 'draft' | 'submitted'
  submitted_at: string | null
}

interface SourcingResponse {
  week: { id: string; week_start: string; week_end: string }
  client: { id: string; name: string; has_apollo_key: boolean; window_open: number | null; window_close: number | null }
  window_is_open: boolean
  is_locked: boolean
  slots: Slot[]
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(weekEnd + 'T00:00:00Z')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

const MAX_SLOTS = 3

export default function SourcingPage() {
  const [data, setData] = useState<SourcingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmSubmitSlot, setConfirmSubmitSlot] = useState<number | null>(null)
  const [editingSlotNumber, setEditingSlotNumber] = useState<number | null>(null)
  const [confirmingWeek, setConfirmingWeek] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/sourcing/slots')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sourcing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  function updateSlotFilters(slotNumber: number, filters: SlotFilters) {
    setData((d) => {
      if (!d) return d
      return {
        ...d,
        slots: d.slots.map((s) => (s.slot_number === slotNumber ? { ...s, filters } : s)),
      }
    })
  }

  async function saveDraft(slot: Slot) {
    await fetch('/api/sourcing/slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_number: slot.slot_number, filters: slot.filters }),
    })
  }

  async function submitSlot(slotNumber: number, requestedCount: number) {
    const slot = data?.slots.find((s) => s.slot_number === slotNumber)
    if (!slot) return
    const res = await fetch('/api/sourcing/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_number: slotNumber,
        requested_count: requestedCount,
        filters: slot.filters,
      }),
    })
    if (res.ok) {
      setConfirmSubmitSlot(null)
      setEditingSlotNumber(null)
      await fetchSlots()
    } else {
      const json = await res.json()
      setError(json.error || 'Failed to submit')
      setConfirmSubmitSlot(null)
    }
  }

  async function clearSlot(slotNumber: number) {
    await fetch('/api/sourcing/slots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_number: slotNumber }),
    })
    await fetchSlots()
  }

  async function confirmWeek() {
    setConfirmingWeek(true)
    try {
      const res = await fetch('/api/sourcing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setShowFinalConfirm(false)
        await fetchSlots()
      } else {
        const json = await res.json()
        setError(json.error || 'Failed to confirm')
      }
    } finally {
      setConfirmingWeek(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  if (error && !data) {
    return <p className="text-text-mid">{error}</p>
  }
  if (!data) return null

  const submittedSlots = data.slots.filter((s) => s.status === 'submitted')
  const allocatedSoFar = submittedSlots.reduce((sum, s) => sum + (s.requested_count || 0), 0)
  const weeklyTarget = PLACEHOLDER_WEEKLY_TARGET
  const lastWeekReceived = PLACEHOLDER_LAST_WEEK_RECEIVED
  const remainingTarget = Math.max(0, weeklyTarget - allocatedSoFar)
  const progressPct = weeklyTarget > 0 ? Math.min(100, (allocatedSoFar / weeklyTarget) * 100) : 0

  const isLocked = data.is_locked
  const allSlotsUsed = submittedSlots.length >= MAX_SLOTS
  const weeklyQuotaMet = allocatedSoFar >= weeklyTarget
  const canInteract = data.window_is_open && data.client.has_apollo_key && !isLocked

  // Which slot the builder is currently focused on:
  //   - If editing a specific submitted slot → that slot
  //   - Else → the first draft slot
  const builderSlot =
    editingSlotNumber !== null
      ? data.slots.find((s) => s.slot_number === editingSlotNumber) || null
      : data.slots.find((s) => s.status === 'draft') || null

  // Show the active builder when:
  //   - Not locked
  //   - The user is actively editing a slot, OR
  //   - They have slots available AND target not met
  const showBuilder =
    !isLocked &&
    builderSlot !== null &&
    (editingSlotNumber !== null || (!allSlotsUsed && !weeklyQuotaMet))

  // Show review screen when target is met or all slots used, not editing,
  // and not already locked.
  const showReview =
    !isLocked &&
    editingSlotNumber === null &&
    (weeklyQuotaMet || allSlotsUsed) &&
    submittedSlots.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Sourcing</h1>
          <p className="text-sm text-text-light mt-1">
            Week of {formatWeekLabel(data.week.week_start, data.week.week_end)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium ${
            isLocked
              ? 'bg-accent-wash text-accent'
              : data.window_is_open
              ? 'bg-accent-wash text-accent'
              : 'bg-offwhite text-text-mid'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLocked || data.window_is_open ? 'bg-accent' : 'bg-text-light'
            }`}
          />
          {isLocked
            ? 'Week confirmed'
            : data.window_is_open
            ? 'Submission window open'
            : 'Submission window closed'}
        </span>
      </div>

      {/* Target + last week summary card */}
      <div className="bg-surface rounded-xl border border-border-custom p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-1">
              Target this week
            </p>
            <p className="font-display text-2xl text-navy">{weeklyTarget.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-1">
              Received last week
            </p>
            <p className="font-display text-2xl text-navy">{lastWeekReceived.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-1">
              Allocated so far
            </p>
            <p className="font-display text-2xl text-navy">
              {allocatedSoFar.toLocaleString()}
              <span className="text-sm text-text-light ml-1">/ {weeklyTarget.toLocaleString()}</span>
            </p>
          </div>
        </div>
        <div className="w-full h-2 bg-offwhite rounded-pill overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-text-light mt-2">
          {weeklyQuotaMet
            ? 'Weekly target met.'
            : `${remainingTarget.toLocaleString()} contacts remaining to reach target`}
        </p>
      </div>

      {!data.client.has_apollo_key && (
        <div className="bg-surface border border-border-custom rounded-xl p-4 text-sm text-text-mid">
          The OPTIN database isn&apos;t connected for this account yet. Please contact your admin to set it up
          before configuring segments.
        </div>
      )}

      {error && (
        <div className="bg-surface border border-border-custom rounded-xl p-4 text-sm text-text-mid">{error}</div>
      )}

      {/* Submitted segments list */}
      {submittedSlots.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs text-text-light uppercase tracking-wider font-medium">
            Submitted segments · {submittedSlots.length} of {MAX_SLOTS}
          </h2>
          {submittedSlots.map((slot) => (
            <SubmittedSegmentCard
              key={slot.slot_number}
              slot={slot}
              canEdit={!isLocked && editingSlotNumber === null}
              isBeingEdited={editingSlotNumber === slot.slot_number}
              onEdit={() => setEditingSlotNumber(slot.slot_number)}
            />
          ))}
        </div>
      )}

      {/* Active segment builder */}
      {showBuilder && builderSlot && (
        <ActiveSegmentCard
          slot={builderSlot}
          disabled={!canInteract}
          isEditing={editingSlotNumber !== null}
          onChange={(filters) => updateSlotFilters(builderSlot.slot_number, filters)}
          onSaveDraft={() => saveDraft(builderSlot)}
          onSubmit={() => setConfirmSubmitSlot(builderSlot.slot_number)}
          onClear={() => clearSlot(builderSlot.slot_number)}
          onCancelEdit={async () => {
            setEditingSlotNumber(null)
            await fetchSlots() // reset local state to server truth
          }}
        />
      )}

      {/* Review screen — shown when target met or all slots used */}
      {showReview && !showBuilder && (
        <div className="bg-surface rounded-xl border border-border-custom p-6">
          <h2 className="font-display text-xl text-navy uppercase tracking-wide mb-2">
            Review your selection
          </h2>
          <p className="text-sm text-text-mid mb-4">
            You&apos;ve allocated {allocatedSoFar.toLocaleString()} contacts across{' '}
            {submittedSlots.length} segment{submittedSlots.length === 1 ? '' : 's'}. Review the
            segments above, then confirm below.
          </p>
          <div className="bg-offwhite rounded-lg p-3 mb-4 text-xs text-text-mid">
            <strong className="text-navy">Heads up:</strong> Once you confirm, the segments lock
            for the week and you can&apos;t change them later. If something looks off, click
            &ldquo;Edit&rdquo; on any segment first.
          </div>
          {!DEMO_MODE && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowFinalConfirm(true)}
                disabled={confirmingWeek}
                className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Confirm selection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Locked / finalized state */}
      {isLocked && (
        <div className="bg-surface rounded-xl border border-border-custom p-8 text-center">
          <p className="font-display text-lg text-navy mb-1 uppercase">Week confirmed</p>
          <p className="text-sm text-text-mid">
            You&apos;ve finalized {submittedSlots.length} segment
            {submittedSlots.length === 1 ? '' : 's'} totaling{' '}
            {allocatedSoFar.toLocaleString()} contacts. The sourcing team will take it from here.
          </p>
        </div>
      )}

      {/* Take-amount modal */}
      {confirmSubmitSlot !== null && (
        <SubmitAllocationModal
          slotNumber={confirmSubmitSlot}
          onCancel={() => setConfirmSubmitSlot(null)}
          onConfirm={(requestedCount) => submitSlot(confirmSubmitSlot, requestedCount)}
          netNewCount={
            data.slots.find((s) => s.slot_number === confirmSubmitSlot)?.net_new_count ?? null
          }
          remainingTarget={remainingTarget}
          previousRequest={
            data.slots.find((s) => s.slot_number === confirmSubmitSlot)?.requested_count ?? null
          }
        />
      )}

      {/* Final week confirmation modal */}
      {showFinalConfirm && (
        <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-border-custom p-6 max-w-md w-full">
            <h3 className="font-display text-xl text-navy mb-2 uppercase">Confirm final selection?</h3>
            <p className="text-sm text-text-mid mb-4">
              You&apos;re about to lock in {submittedSlots.length} segment
              {submittedSlots.length === 1 ? '' : 's'} totaling{' '}
              {allocatedSoFar.toLocaleString()} contacts. This cannot be undone for this week.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFinalConfirm(false)}
                disabled={confirmingWeek}
                className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmWeek}
                disabled={confirmingWeek}
                className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {confirmingWeek ? 'Confirming…' : 'Confirm & lock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Submitted segment summary card ──────────────────────────

function SubmittedSegmentCard({
  slot,
  canEdit,
  isBeingEdited,
  onEdit,
}: {
  slot: Slot
  canEdit: boolean
  isBeingEdited: boolean
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const summary = summarizeFilters(slot.filters)

  return (
    <div
      className={`bg-surface rounded-xl border transition-colors ${
        isBeingEdited ? 'border-accent' : 'border-border-custom'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className="text-xs px-2 py-0.5 rounded-pill font-medium bg-accent-wash text-accent shrink-0">
            Segment {slot.slot_number}
          </span>
          <p className="text-sm text-text-mid truncate">{summary || 'No filters'}</p>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-display text-lg text-navy">
            {slot.requested_count?.toLocaleString() ?? '—'}
          </p>
          {canEdit && !isBeingEdited && (
            <button
              onClick={onEdit}
              className="text-xs text-accent hover:text-accent-bright font-medium"
            >
              Edit
            </button>
          )}
          {isBeingEdited && (
            <span className="text-xs text-accent font-medium">Editing…</span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-text-light text-xs"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-border-custom space-y-1.5">
          {filterRow('Location', slot.filters.person_locations)}
          {filterRow('Titles', slot.filters.person_titles)}
          {filterRow(
            'Seniority',
            slot.filters.person_seniorities?.map(
              (v) => APOLLO_SENIORITIES.find((s) => s.value === v)?.label || v
            )
          )}
          {filterRow(
            'Departments',
            slot.filters.person_department_or_subdepartments?.map(departmentLabel)
          )}
          {filterRow('Industry', slot.filters.industries)}
          {filterRow('Keywords', slot.filters.q_organization_keyword_tags)}
          {filterRow(
            'Employee Size',
            slot.filters.organization_num_employees_ranges?.map(
              (v) => APOLLO_EMPLOYEE_RANGES.find((r) => r.value === v)?.label || v
            )
          )}
          <p className="text-xs text-text-light pt-2">
            Total available: {slot.net_new_count?.toLocaleString() ?? '—'}
          </p>
        </div>
      )}
    </div>
  )
}

function summarizeFilters(filters: SlotFilters): string {
  const parts: string[] = []
  if (filters.person_locations?.length) parts.push(filters.person_locations.join(', '))
  if (filters.industries?.length) parts.push(filters.industries.join(', '))
  if (filters.person_titles?.length) parts.push(filters.person_titles.join(', '))
  return parts.join(' · ')
}

function filterRow(label: string, values: string[] | undefined) {
  if (!values?.length) return null
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-text-light uppercase tracking-wider font-medium min-w-[110px]">
        {label}
      </span>
      <span className="text-sm text-text-mid">{values.join(', ')}</span>
    </div>
  )
}

// ─── Active (in-progress) segment builder ────────────────────

interface ActiveSegmentCardProps {
  slot: Slot
  disabled: boolean
  isEditing: boolean
  onChange: (filters: SlotFilters) => void
  onSaveDraft: () => void
  onSubmit: () => void
  onClear: () => void
  onCancelEdit: () => void
}

function ActiveSegmentCard({
  slot,
  disabled,
  isEditing,
  onChange,
  onSaveDraft,
  onSubmit,
  onClear,
  onCancelEdit,
}: ActiveSegmentCardProps) {
  const [count, setCount] = useState<number | null>(slot.net_new_count)
  const [countLoading, setCountLoading] = useState(false)
  const [countError, setCountError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filters = slot.filters

  // Debounced count fetch whenever filters change
  useEffect(() => {
    if (!hasAnyFilter(filters)) {
      setCount(null)
      setCountError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setCountLoading(true)
      setCountError(null)
      try {
        const res = await fetch('/api/apollo/count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        })
        const json = await res.json()
        if (json.error === 'no_api_key') {
          setCountError('OPTIN database not configured')
          setCount(null)
        } else if (json.error) {
          setCountError('Database error')
          setCount(null)
        } else {
          setCount(json.count ?? 0)
        }
      } catch {
        setCountError('Network error')
      } finally {
        setCountLoading(false)
      }
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters])

  // Auto-save draft on filter change. We do this even when editing a
  // previously submitted slot — the server handles flipping the slot back
  // to "draft" until resubmit.
  useEffect(() => {
    if (disabled) return
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current)
    draftSaveRef.current = setTimeout(() => {
      onSaveDraft()
    }, 1200)
    return () => {
      if (draftSaveRef.current) clearTimeout(draftSaveRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  function setField<K extends keyof SlotFilters>(key: K, value: SlotFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  async function loadLocationSuggestions(q: string) {
    const res = await fetch(`/api/apollo/locations?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const json = await res.json()
    return json.suggestions || []
  }

  async function loadIndustrySuggestions(q: string) {
    const query = q.toLowerCase()
    return APOLLO_INDUSTRIES.filter((label) => label.toLowerCase().includes(query))
      .slice(0, 25)
      .map((label) => ({ label }))
  }

  const hasFilters = hasAnyFilter(filters)
  const canSubmit = !disabled && hasFilters && count !== null && count > 0 && !countLoading

  return (
    <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg text-navy uppercase tracking-wide">
            {isEditing ? `Editing Segment ${slot.slot_number}` : `Segment ${slot.slot_number}`}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {hasFilters && !isEditing && (
            <button
              onClick={onClear}
              className="text-xs text-text-light hover:text-text-mid transition-colors"
            >
              Clear
            </button>
          )}
          {isEditing && (
            <button
              onClick={onCancelEdit}
              className="text-xs text-text-light hover:text-text-mid transition-colors"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Location */}
        <div>
          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
            Location
          </label>
          <TypeaheadChipInput
            values={filters.person_locations || []}
            onChange={(v) => setField('person_locations', v)}
            placeholder="e.g. United States, California"
            disabled={disabled}
            loadSuggestions={loadLocationSuggestions}
            allowFreeText={false}
          />
        </div>

        {/* Job Title */}
        <div>
          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
            Job Title
          </label>
          <ChipInput
            values={filters.person_titles || []}
            onChange={(v) => setField('person_titles', v)}
            placeholder="e.g. VP of Marketing, Head of Growth"
            disabled={disabled}
          />
          <div className="mt-2">
            <p className="text-xs text-text-light mb-1.5">Seniority</p>
            <ChipToggle
              options={APOLLO_SENIORITIES}
              values={filters.person_seniorities || []}
              onChange={(v) => setField('person_seniorities', v)}
              disabled={disabled}
            />
          </div>
          <div className="mt-3">
            <p className="text-xs text-text-light mb-1.5">Departments &amp; Job Functions</p>
            <DepartmentPicker
              values={filters.person_department_or_subdepartments || []}
              onChange={(v) => setField('person_department_or_subdepartments', v)}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Industry */}
        <div>
          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
            Industry
          </label>
          <TypeaheadChipInput
            values={filters.industries || []}
            onChange={(v) => setField('industries', v)}
            placeholder="Search industries…"
            disabled={disabled}
            loadSuggestions={loadIndustrySuggestions}
            allowFreeText={false}
          />
        </div>

        {/* Free Keywords */}
        <div>
          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
            Free Keywords
          </label>
          <ChipInput
            values={filters.q_organization_keyword_tags || []}
            onChange={(v) => setField('q_organization_keyword_tags', v)}
            placeholder="e.g. B2B, enterprise, SMB"
            disabled={disabled}
          />
        </div>

        {/* Employee Size */}
        <div>
          <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
            Employee Size <span className="text-text-light normal-case">(optional)</span>
          </label>
          <ChipToggle
            options={APOLLO_EMPLOYEE_RANGES}
            values={filters.organization_num_employees_ranges || []}
            onChange={(v) => setField('organization_num_employees_ranges', v)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border-custom">
        <div>
          <p className="text-xs text-text-light uppercase tracking-wider font-medium">
            Total Available
          </p>
          <p className="font-display text-2xl text-navy">
            {countLoading
              ? '…'
              : countError
              ? '—'
              : count !== null
              ? count.toLocaleString()
              : '—'}
          </p>
          {countError && <p className="text-xs text-text-light">{countError}</p>}
        </div>
        {!DEMO_MODE && (
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEditing ? 'Save changes' : 'Submit segment'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Allocation / submit modal ───────────────────────────────

interface SubmitAllocationModalProps {
  slotNumber: number
  netNewCount: number | null
  remainingTarget: number
  previousRequest: number | null
  onCancel: () => void
  onConfirm: (requestedCount: number) => void
}

function SubmitAllocationModal({
  slotNumber,
  netNewCount,
  remainingTarget,
  previousRequest,
  onCancel,
  onConfirm,
}: SubmitAllocationModalProps) {
  // Default: keep the previous request if editing; otherwise min(available, remaining target).
  const defaultTake =
    previousRequest ??
    (netNewCount
      ? Math.max(1, Math.min(netNewCount, remainingTarget || netNewCount))
      : 0)
  const [take, setTake] = useState<string>(defaultTake ? String(defaultTake) : '')

  const takeNum = Number(take)
  const maxTake = netNewCount ?? Infinity
  const isValid = takeNum > 0 && takeNum <= maxTake

  return (
    <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl border border-border-custom p-6 max-w-md w-full">
        <h3 className="font-display text-xl text-navy mb-2 uppercase">
          Submit segment {slotNumber}
        </h3>
        <p className="text-sm text-text-mid mb-4">
          How many contacts do you want to allocate from this segment?
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="bg-offwhite rounded-lg p-3">
            <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-1">
              Available
            </p>
            <p className="font-display text-xl text-navy">
              {netNewCount?.toLocaleString() ?? '—'}
            </p>
          </div>
          <div className="bg-offwhite rounded-lg p-3">
            <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-1">
              Target remaining
            </p>
            <p className="font-display text-xl text-navy">
              {remainingTarget.toLocaleString()}
            </p>
          </div>
        </div>

        <label className="block text-xs text-text-light uppercase tracking-wider font-medium mb-1.5">
          Take from this segment
        </label>
        <input
          type="number"
          min={1}
          max={netNewCount || undefined}
          value={take}
          onChange={(e) => setTake(e.target.value)}
          className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          placeholder="e.g. 4500"
        />
        {takeNum > maxTake && (
          <p className="text-xs text-red-500 mt-1">
            Exceeds available total ({netNewCount?.toLocaleString()})
          </p>
        )}

        <p className="text-xs text-text-light mt-3">
          You can still edit or remove this segment later, until you confirm the whole week.
        </p>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(takeNum)}
            disabled={!isValid}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
