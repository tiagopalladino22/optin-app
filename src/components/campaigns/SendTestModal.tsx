'use client'

import { useEffect, useState } from 'react'
import { useData } from '@/lib/DataProvider'

interface SendTestModalProps {
  campaignId: number
  instanceId?: string
  onClose: () => void
}

export default function SendTestModal({ campaignId, instanceId, onClose }: SendTestModalProps) {
  const { userEmail } = useData()
  const [emails, setEmails] = useState(userEmail || '')
  const [sending, setSending] = useState(false)
  const [loadingCampaign, setLoadingCampaign] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaignData, setCampaignData] = useState<any>(null)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Fetch campaign data on mount (needed for test endpoint)
  useEffect(() => {
    const qs = instanceId ? `?instance=${instanceId}` : ''
    fetch(`/api/listmonk/campaigns/${campaignId}${qs}`)
      .then((r) => r.json())
      .then((json) => setCampaignData(json.data))
      .catch(() => setResult({ success: false, message: 'Failed to load campaign data' }))
      .finally(() => setLoadingCampaign(false))
  }, [campaignId, instanceId])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSend() {
    const subscribers = emails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)

    if (subscribers.length === 0) {
      setResult({ success: false, message: 'Enter at least one email address' })
      return
    }

    if (!campaignData) {
      setResult({ success: false, message: 'Campaign data not loaded' })
      return
    }

    setSending(true)
    setResult(null)

    try {
      const qs = instanceId ? `?instance=${instanceId}` : ''
      const res = await fetch(`/api/listmonk/campaigns/${campaignId}/test${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignData.name,
          subject: campaignData.subject,
          from_email: campaignData.from_email,
          lists: (campaignData.lists || []).map((l: { id: number }) => l.id),
          type: campaignData.type || 'regular',
          content_type: campaignData.content_type || 'html',
          body: campaignData.body || '',
          template_id: campaignData.template_id || undefined,
          messenger: 'email',
          subscribers,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Failed to send test (${res.status})`)
      }

      setResult({
        success: true,
        message: `Test email sent to ${subscribers.join(', ')}`,
      })
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test email',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border-custom shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-custom">
          <h3 className="font-display text-lg text-navy uppercase tracking-wide">Send Test Email</h3>
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
            <label className="block text-sm font-medium text-text-mid mb-1.5">
              Recipient email(s)
            </label>
            <input
              type="text"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="you@example.com, colleague@example.com"
              className="w-full px-3 py-2.5 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
            />
            <p className="text-xs text-text-light mt-1.5">
              Separate multiple emails with commas
            </p>
          </div>

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
            onClick={handleSend}
            disabled={sending || !emails.trim() || loadingCampaign}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
