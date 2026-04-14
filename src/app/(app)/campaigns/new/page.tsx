'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function CreateCampaignPage() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [body, setBody] = useState('')
  const [selectedLists, setSelectedLists] = useState<number[]>([])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [lists, setLists] = useState<ListOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function fetchOptions() {
      const [listsRes, templatesRes] = await Promise.all([
        fetch('/api/listmonk/lists?per_page=100'),
        fetch('/api/listmonk/templates?per_page=100'),
      ])
      const listsData = await listsRes.json()
      const templatesData = await templatesRes.json()
      setLists(listsData.data?.results || [])
      setTemplates(templatesData.data || [])
    }
    fetchOptions()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/listmonk/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          from_email: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          lists: selectedLists,
          type: 'regular',
          content_type: 'html',
          body: body || '<p></p>',
          template_id: templateId,
          tags: [],
          send_at: null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to create campaign')
      }

      const data = await res.json()
      const newId = data.data?.id
      if (newId) {
        router.push(`/campaigns/${newId}/edit`)
      } else {
        router.push('/campaigns')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-text-light hover:text-text-mid mb-1 block"
        >
          &larr; Back to Campaigns
        </button>
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Create Campaign</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-surface rounded-xl border border-border-custom p-6 space-y-5">
          <h2 className="text-sm font-medium text-text-mid uppercase tracking-wider">Campaign Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-mid mb-1">Campaign Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                placeholder="e.g. March Newsletter"
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
                required
                className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                placeholder="newsletter@yourdomain.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-mid mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
              placeholder="e.g. This week's top stories"
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
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                >
                  <option value="">Select a template</option>
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
            <div className="border border-border-custom rounded-lg overflow-hidden bg-white" style={{ minHeight: '400px' }}>
              {body ? (
                <iframe
                  srcDoc={body}
                  sandbox="allow-same-origin"
                  className="w-full border-0"
                  style={{ minHeight: '400px' }}
                  title="Email Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-sm text-text-light">
                  No content to preview. Paste your HTML in the editor.
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste your email HTML here..."
              className="w-full px-4 py-3 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm font-mono leading-relaxed resize-y"
              rows={20}
              spellCheck={false}
            />
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || selectedLists.length === 0}
            className="px-5 py-2.5 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 border border-border-custom text-text-mid hover:bg-surface rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
