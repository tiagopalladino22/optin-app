'use client'

import { useEffect, useState, useRef } from 'react'

interface CampaignPreviewModalProps {
  campaignId: number
  instanceId?: string
  onClose: () => void
}

export default function CampaignPreviewModal({ campaignId, instanceId, onClose }: CampaignPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    async function fetchPreview() {
      try {
        const qs = instanceId ? `?instance=${instanceId}` : ''
        const res = await fetch(`/api/listmonk/campaigns/${campaignId}/preview${qs}`)
        if (!res.ok) throw new Error('Failed to load preview')
        const text = await res.text()
        setHtml(text)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview')
      } finally {
        setLoading(false)
      }
    }
    fetchPreview()
  }, [campaignId, instanceId])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border-custom shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-custom shrink-0">
          <h3 className="font-display text-lg text-navy uppercase tracking-wide">Campaign Preview</h3>
          <div className="flex items-center gap-3">
            {/* Viewport toggle */}
            <div className="flex rounded-lg border border-border-custom overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('desktop')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'desktop'
                    ? 'bg-accent text-white'
                    : 'text-text-mid hover:bg-offwhite'
                }`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mobile')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'mobile'
                    ? 'bg-accent text-white'
                    : 'text-text-mid hover:bg-offwhite'
                }`}
              >
                Mobile
              </button>
            </div>
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-6">
          {loading && (
            <div className="text-sm text-text-light">Loading preview...</div>
          )}
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          {html && (
            <div
              className={`bg-white shadow-lg rounded-lg overflow-hidden h-full transition-all duration-300 ${
                viewMode === 'mobile' ? 'w-[375px]' : 'w-full'
              }`}
            >
              <iframe
                ref={iframeRef}
                srcDoc={html}
                sandbox="allow-same-origin"
                className="w-full h-full border-0"
                title="Campaign Preview"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
