'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import CampaignPreviewModal from '@/components/campaigns/CampaignPreviewModal'
import SendTestModal from '@/components/campaigns/SendTestModal'
import ListPicker from '@/components/campaigns/ListPicker'

interface ListOption {
  id: number
  name: string
  subscriber_count?: number
}

interface TemplateOption {
  id: number
  name: string
}

export default function EditCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = Number(params.id)
  const instanceId = searchParams.get('instance') || undefined

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [body, setBody] = useState('')
  const [selectedLists, setSelectedLists] = useState<number[]>([])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [status, setStatus] = useState('')

  const [lists, setLists] = useState<ListOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])

  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [showPreview, setShowPreview] = useState(false)
  const [showRenderedPreview, setShowRenderedPreview] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)

  const qs = instanceId ? `?instance=${instanceId}` : ''

  const fetchCampaign = useCallback(async () => {
    try {
      const [campaignRes, listsRes, templatesRes] = await Promise.all([
        fetch(`/api/listmonk/campaigns/${campaignId}${qs}`),
        fetch(`/api/listmonk/lists?per_page=100${qs ? '&' + qs.slice(1) : ''}`),
        fetch(`/api/listmonk/templates?per_page=100${qs ? '&' + qs.slice(1) : ''}`),
      ])

      const campaignData = await campaignRes.json()
      const listsData = await listsRes.json()
      const templatesData = await templatesRes.json()

      const c = campaignData.data
      if (!c) throw new Error('Campaign not found')

      // Redirect if campaign isn't editable
      if (c.status !== 'draft' && c.status !== 'scheduled') {
        router.replace(`/campaigns/${campaignId}${qs}`)
        return
      }

      setName(c.name || '')
      setSubject(c.subject || '')
      // Parse "Name <email>" format
      const fromMatch = (c.from_email || '').match(/^(.+?)\s*<(.+)>$/)
      if (fromMatch) {
        setFromName(fromMatch[1].trim())
        setFromEmail(fromMatch[2].trim())
      } else {
        setFromEmail(c.from_email || '')
      }
      setBody(c.body || '')
      setSelectedLists(c.lists?.map((l: { id: number }) => l.id) || [])
      setTemplateId(c.template_id || null)
      setStatus(c.status || '')

      setLists(listsData.data?.results || [])
      setTemplates(templatesData.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign')
    } finally {
      setPageLoading(false)
    }
  }, [campaignId, qs, router])

  useEffect(() => {
    fetchCampaign()
  }, [fetchCampaign])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaveSuccess(false)

    try {
      const res = await fetch(`/api/listmonk/campaigns/${campaignId}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          from_email: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          lists: selectedLists,
          content_type: 'html',
          body,
          template_id: templateId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to save campaign')
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    if (!confirm('Are you sure you want to start sending this campaign? This cannot be undone.')) return
    setSending(true)
    setError('')

    try {
      // Save first to ensure latest changes are persisted
      const saveRes = await fetch(`/api/listmonk/campaigns/${campaignId}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          from_email: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          lists: selectedLists,
          content_type: 'html',
          body,
          template_id: templateId,
        }),
      })
      if (!saveRes.ok) throw new Error('Failed to save before sending')

      const res = await fetch(`/api/listmonk/campaigns/${campaignId}/status${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to start campaign')
      }

      router.push(`/campaigns/${campaignId}${qs}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send campaign')
    } finally {
      setSending(false)
    }
  }

  if (pageLoading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push(`/campaigns/${campaignId}${qs}`)}
            className="text-sm text-text-light hover:text-text-mid mb-1 block"
          >
            &larr; Back to Campaign
          </button>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Edit Campaign</h1>
          <p className="text-sm text-text-light mt-1 capitalize">Status: {status}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowRenderedPreview(true)}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm transition-colors"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-offwhite rounded-lg font-medium text-sm transition-colors"
          >
            Send Test
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selectedLists.length === 0}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Campaign'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">
          Campaign saved successfully
        </div>
      )}

      {/* Campaign details */}
      <div className="bg-surface rounded-xl border border-border-custom p-6 space-y-5">
        <h2 className="text-sm font-medium text-text-mid uppercase tracking-wider">Campaign Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">From Name</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              placeholder="e.g. The Daily Newsletter"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">From Email</label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-mid mb-1">Subject Line</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <ListPicker
              lists={lists}
              selected={selectedLists}
              onChange={setSelectedLists}
            />
          </div>

          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Template</label>
              <select
                value={templateId || ''}
                onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* HTML Content */}
      <div className="bg-surface rounded-xl border border-border-custom p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-mid uppercase tracking-wider">Email Content</h2>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showPreview
                ? 'bg-accent text-white'
                : 'border border-border-custom text-text-mid hover:bg-offwhite'
            }`}
          >
            {showPreview ? 'Edit HTML' : 'Preview'}
          </button>
        </div>

        {showPreview ? (
          <div className="border border-border-custom rounded-lg overflow-hidden bg-white" style={{ minHeight: '500px' }}>
            {body ? (
              <iframe
                srcDoc={body}
                sandbox="allow-same-origin"
                className="w-full border-0"
                style={{ minHeight: '500px' }}
                title="Email Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-text-light">
                No content to preview
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Paste your email HTML here..."
            className="w-full px-4 py-3 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm font-mono leading-relaxed resize-y"
            rows={24}
            spellCheck={false}
          />
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/campaigns/${campaignId}${qs}`)}
          className="px-5 py-2.5 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Modals */}
      {showRenderedPreview && (
        <CampaignPreviewModal
          campaignId={campaignId}
          instanceId={instanceId}
          onClose={() => setShowRenderedPreview(false)}
        />
      )}

      {showTestModal && (
        <SendTestModal
          campaignId={campaignId}
          instanceId={instanceId}
          onClose={() => setShowTestModal(false)}
        />
      )}
    </div>
  )
}
