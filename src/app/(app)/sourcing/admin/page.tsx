'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { APOLLO_SENIORITIES, APOLLO_EMPLOYEE_RANGES, SlotFilters } from '@/lib/apollo'
import { departmentLabel } from '@/lib/apollo-departments'

interface AdminSlot {
  id: string
  slot_number: number
  filters: SlotFilters
  net_new_count: number | null
  requested_count: number | null
  submitted_at: string | null
}

interface ClientGroup {
  client_id: string
  client_name: string
  week_end: string
  slots: AdminSlot[]
}

interface AdminResponse {
  week_start: string
  clients: ClientGroup[]
}

function seniorityLabel(value: string): string {
  return APOLLO_SENIORITIES.find((s) => s.value === value)?.label || value
}

function employeeRangeLabel(value: string): string {
  return APOLLO_EMPLOYEE_RANGES.find((r) => r.value === value)?.label || value
}

function formatFiltersPlain(filters: SlotFilters): string {
  const lines: string[] = []
  if (filters.person_locations?.length) lines.push(`Location: ${filters.person_locations.join(', ')}`)
  if (filters.person_titles?.length) lines.push(`Titles: ${filters.person_titles.join(', ')}`)
  if (filters.person_seniorities?.length) {
    lines.push(`Seniority: ${filters.person_seniorities.map(seniorityLabel).join(', ')}`)
  }
  if (filters.person_department_or_subdepartments?.length) {
    lines.push(
      `Departments: ${filters.person_department_or_subdepartments.map(departmentLabel).join(', ')}`
    )
  }
  if (filters.industries?.length) {
    lines.push(`Industry: ${filters.industries.join(', ')}`)
  }
  if (filters.q_organization_keyword_tags?.length) {
    lines.push(`Keywords: ${filters.q_organization_keyword_tags.join(', ')}`)
  }
  if (filters.organization_num_employees_ranges?.length) {
    lines.push(`Employee Size: ${filters.organization_num_employees_ranges.map(employeeRangeLabel).join(', ')}`)
  }
  return lines.join('\n')
}

function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysFromMonday))
  return monday.toISOString().slice(0, 10)
}

export default function AdminSourcingPage() {
  const [data, setData] = useState<AdminResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState<string>(() => {
    const now = new Date()
    const day = now.getUTCDay()
    const daysFromMonday = day === 0 ? 6 : day - 1
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday))
    return monday.toISOString().slice(0, 10)
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchData = useCallback(async (week: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sourcing/admin?week=${week}`)
      const json = await res.json()
      if (res.ok) setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(weekStart)
  }, [fetchData, weekStart])

  async function copyFilters(slot: AdminSlot, clientName: string) {
    const text = `${clientName} — Segment ${slot.slot_number}\nRequested: ${slot.requested_count?.toLocaleString() ?? '—'}\nNet New: ${slot.net_new_count?.toLocaleString() ?? '—'}\n${formatFiltersPlain(slot.filters)}`
    await navigator.clipboard.writeText(text)
    setCopiedId(slot.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/sourcing" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            ← Sourcing
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Sourcing Queue</h1>
          <p className="text-sm text-text-light mt-1">Submitted segments by client</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-light uppercase tracking-wider font-medium">Week of</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(isoWeekStart(e.target.value))}
            className="px-3 py-2 border border-border-custom rounded-lg text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      ) : !data || data.clients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">No segments submitted for this week yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.clients.map((group) => (
            <div key={group.client_id} className="bg-surface rounded-xl border border-border-custom overflow-hidden">
              <div className="px-5 py-3 border-b border-border-custom bg-offwhite">
                <h2 className="font-display text-lg text-navy uppercase tracking-wide">{group.client_name}</h2>
                <p className="text-xs text-text-light">
                  {group.slots.length} segment{group.slots.length === 1 ? '' : 's'} submitted
                </p>
              </div>
              <div className="divide-y divide-border-custom">
                {group.slots.map((slot) => (
                  <div key={slot.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-xs text-text-light uppercase tracking-wider font-medium">
                          Segment {slot.slot_number}
                        </p>
                        <p className="font-display text-2xl text-navy">
                          {slot.requested_count?.toLocaleString() ?? '—'}
                          <span className="text-xs text-text-light ml-2">requested</span>
                        </p>
                        <p className="text-xs text-text-light mt-0.5">
                          {slot.net_new_count?.toLocaleString() ?? '—'} net new available
                        </p>
                      </div>
                      <button
                        onClick={() => copyFilters(slot, group.client_name)}
                        className="px-3 py-1.5 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg text-xs font-medium transition-colors"
                      >
                        {copiedId === slot.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    <div className="space-y-2 text-sm">
                      {slot.filters.person_locations?.length ? (
                        <FilterRow label="Location" values={slot.filters.person_locations} />
                      ) : null}
                      {slot.filters.person_titles?.length ? (
                        <FilterRow label="Titles" values={slot.filters.person_titles} />
                      ) : null}
                      {slot.filters.person_seniorities?.length ? (
                        <FilterRow
                          label="Seniority"
                          values={slot.filters.person_seniorities.map(seniorityLabel)}
                        />
                      ) : null}
                      {slot.filters.person_department_or_subdepartments?.length ? (
                        <FilterRow
                          label="Departments"
                          values={slot.filters.person_department_or_subdepartments.map(departmentLabel)}
                        />
                      ) : null}
                      {slot.filters.industries?.length ? (
                        <FilterRow label="Industry" values={slot.filters.industries} />
                      ) : null}
                      {slot.filters.q_organization_keyword_tags?.length ? (
                        <FilterRow label="Keywords" values={slot.filters.q_organization_keyword_tags} />
                      ) : null}
                      {slot.filters.organization_num_employees_ranges?.length ? (
                        <FilterRow
                          label="Employee Size"
                          values={slot.filters.organization_num_employees_ranges.map(employeeRangeLabel)}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-text-light uppercase tracking-wider font-medium min-w-[140px]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center px-2 py-0.5 bg-accent-wash text-accent rounded-pill text-xs font-medium"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}
