'use client'

import { useEffect, useState } from 'react'

interface GrowthClient {
  growth_client_id: string
  label: string
}

interface PushKPIsModalProps {
  campaignIds: number[]
  instanceId?: string
  defaultIssueName?: string
  onClose: () => void
}

export default function PushKPIsModal({
  campaignIds,
  instanceId,
  defaultIssueName,
  onClose,
}: PushKPIsModalProps) {
  const [clients, setClients] = useState<GrowthClient[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [issueName, setIssueName] = useState(defaultIssueName || '')
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Fetch available growth clients
  useEffect(() => {
    fetch('/api/growth-clients')
      .then((r) => r.json())
      .then((json) => setClients(json.data || []))
      .catch(() => setResult({ success: false, message: 'Failed to load 150growth clients' }))
      .finally(() => setLoadingClients(false))
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handlePush() {
    if (!selectedClientId) {
      setResult({ success: false, message: 'Select a client' })
      return
    }
    if (!issueName.trim()) {
      setResult({ success: false, message: 'Issue name is required' })
      return
    }

    setPushing(true)
    setResult(null)

    try {
      const res = await fetch('/api/campaigns/push-kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignIds,
          growthClientId: selectedClientId,
          issueName: issueName.trim(),
          instanceId,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`)

      setResult({
        success: true,
        message: `Pushed ${json.campaigns} campaign(s): ${json.recipients?.toLocaleString()} recipients, ${json.opens?.toLocaleString()} opens`,
      })
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to push KPIs',
      })
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border-custom shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-custom">
          <h3 className="font-display text-lg text-navy uppercase tracking-wide">Push KPIs to 150growth</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-offwhite text-text-light hover:text-text-mid transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1.5">Client</label>
            {loadingClients ? (
              <div className="skeleton h-10 w-full" />
            ) : clients.length === 0 ? (
              <p className="text-sm text-text-light border border-border-custom rounded-lg px-3 py-2.5">
                No 150growth clients configured. Set the Growth Client ID on a client in Settings first.
              </p>
            ) : (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2.5 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.growth_client_id} value={c.growth_client_id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-mid mb-1.5">
              Issue Name
            </label>
            <input
              type="text"
              value={issueName}
              onChange={(e) => setIssueName(e.target.value)}
              placeholder="e.g. April 14 issue"
              className="w-full px-3 py-2.5 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
            />
            <p className="text-xs text-text-light mt-1.5">
              Label for this entry in 150growth
            </p>
          </div>

          <p className="text-xs text-text-light">
            Will aggregate KPIs from {campaignIds.length} campaign{campaignIds.length !== 1 ? 's' : ''} and push as a single entry.
          </p>

          {result && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                result.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {result.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-custom">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg text-sm font-medium transition-colors"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handlePush}
            disabled={pushing || loadingClients || !selectedClientId || !issueName.trim() || result?.success}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {pushing ? 'Pushing...' : 'Push KPIs'}
          </button>
        </div>
      </div>
    </div>
  )
}
