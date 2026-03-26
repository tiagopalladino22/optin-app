'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Publication {
  code: string
  name: string
}

interface Automation {
  id: string
  name: string
  publication_id: string | null
  publication: Publication | null
  schedule_day: number
  schedule_hour: number
  schedule_timezone: string
  actions: string[]
  is_active: boolean
  created_at: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ACTION_LABELS: Record<string, string> = {
  store_data: 'Store Data',
  export_csv: 'Export CSV',
  delete_subscribers: 'Delete Subs',
  store_count: 'Store Count',
}

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

function formatSchedule(day: number, hour: number, timezone: string) {
  const dayName = DAY_NAMES[day] || `Day ${day}`
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const tzAbbr = TZ_ABBRS[timezone] || timezone
  return `${dayName} ${displayHour}:00 ${period} ${tzAbbr}`
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  async function fetchAutomations() {
    try {
      const res = await fetch('/api/automations')
      const data = await res.json()
      setAutomations(data.data || [])
    } catch (err) {
      console.error('Failed to fetch automations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAutomations()
  }, [])

  async function handleToggle(automation: Automation) {
    setToggling(automation.id)
    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: automation.id, is_active: !automation.is_active }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setAutomations((prev) =>
        prev.map((a) => (a.id === automation.id ? { ...a, is_active: !a.is_active } : a))
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setToggling(null)
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
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Automations</h1>
        <Link
          href="/automations/new"
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors"
        >
          Create Automation
        </Link>
      </div>

      {automations.length === 0 ? (
        <div className="bg-white rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">No automations yet.</p>
          <p className="text-sm text-text-light mt-2">
            Create scheduled automations to process subscribers automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-custom bg-offwhite">
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Publication</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Schedule</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Actions</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Status</th>
                <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {automations.map((auto) => (
                <tr key={auto.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                  <td className="px-4 py-3">
                    <Link href={`/automations/${auto.id}`} className="text-accent hover:text-accent-bright font-medium">
                      {auto.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {auto.publication ? (
                      <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-offwhite text-text-mid">
                        {auto.publication.code}
                      </span>
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-mid">
                    {formatSchedule(auto.schedule_day, auto.schedule_hour, auto.schedule_timezone)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(auto.actions || []).map((action) => (
                        <span
                          key={action}
                          className="inline-block px-2 py-0.5 rounded-lg text-xs font-medium bg-offwhite text-text-mid"
                        >
                          {ACTION_LABELS[action] || action}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(auto)}
                      disabled={toggling === auto.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        auto.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          auto.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-text-light">
                    {new Date(auto.created_at).toLocaleDateString()}
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
