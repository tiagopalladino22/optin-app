'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ListOption {
  id: number
  name: string
}

interface TemplateOption {
  id: number
  name: string
}

export default function CreateCampaignPage() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [selectedLists, setSelectedLists] = useState<number[]>([])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [lists, setLists] = useState<ListOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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

  function toggleList(id: number) {
    setSelectedLists((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
  }

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
          from_email: fromEmail,
          lists: selectedLists,
          type: 'regular',
          content_type: 'richtext',
          body: '<p>Edit this campaign content</p>',
          template_id: templateId,
          tags: [],
          send_at: null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to create campaign')
      }

      router.push('/campaigns')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Create Campaign</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border-custom p-6 space-y-5">
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

        <div>
          <label className="block text-sm font-medium text-text-mid mb-2">Lists</label>
          {lists.length === 0 ? (
            <p className="text-sm text-text-light">No lists available</p>
          ) : (
            <div className="space-y-2">
              {lists.map((list) => (
                <label key={list.id} className="flex items-center gap-2 text-sm text-text-mid">
                  <input
                    type="checkbox"
                    checked={selectedLists.includes(list.id)}
                    onChange={() => toggleList(list.id)}
                    className="rounded border-border-custom text-accent focus:ring-accent"
                  />
                  {list.name}
                </label>
              ))}
            </div>
          )}
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || selectedLists.length === 0}
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-border-custom text-text-mid hover:bg-white rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
