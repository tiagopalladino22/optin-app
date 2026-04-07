'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Pagination from '@/components/ui/Pagination'
import { useData } from '@/lib/DataProvider'

const PER_PAGE = 10

export default function CampaignsPage() {
  const { campaigns, campaignsLoading } = useData()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns
    const q = search.toLowerCase()
    return campaigns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)
    )
  }, [campaigns, search])

  const totalPages = Math.ceil(filteredCampaigns.length / PER_PAGE)
  const paginatedCampaigns = useMemo(
    () => filteredCampaigns.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filteredCampaigns, page]
  )

  useEffect(() => setPage(1), [search])

  if (campaignsLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm transition-colors"
        >
          Create Campaign
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="flex-1 px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
          />
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds).join(',')
                  router.push(`/campaigns/summary?ids=${ids}`)
                }}
                className="px-4 py-2 border border-accent text-accent hover:bg-accent-wash rounded-lg font-medium text-sm transition-colors shrink-0"
              >
                Summary
              </button>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds).join(',')
                  router.push(`/campaigns/${Array.from(selectedIds)[0]}?queue=${ids}`)
                }}
                className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm transition-colors shrink-0"
              >
                View {selectedIds.size} selected
              </button>
            </>
          )}
        </div>
      )}

      {filteredCampaigns.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">
            {search ? 'No campaigns match your search.' : 'No campaigns yet. Create your first campaign.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-custom bg-offwhite">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={paginatedCampaigns.length > 0 && paginatedCampaigns.every((c) => selectedIds.has(c.id))}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          for (const c of paginatedCampaigns) {
                            if (e.target.checked) next.add(c.id)
                            else next.delete(c.id)
                          }
                          return next
                        })
                      }}
                      className="rounded border-border-custom text-accent focus:ring-accent"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Subject</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCampaigns.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-border-custom last:border-0 hover:bg-offwhite/50 ${selectedIds.has(c.id) ? 'bg-accent-wash/30' : ''}`}
                  >
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(c.id)) next.delete(c.id)
                            else next.add(c.id)
                            return next
                          })
                        }}
                        className="rounded border-border-custom text-accent focus:ring-accent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${c.id}`} className="text-accent hover:text-accent-bright font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-mid">{c.subject}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-text-light">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-text-mid',
    running: 'bg-accent-wash text-accent',
    scheduled: 'bg-amber-50 text-amber-700',
    paused: 'bg-orange-50 text-orange-700',
    cancelled: 'bg-red-50 text-red-600',
    finished: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${styles[status] || 'bg-gray-100 text-text-mid'}`}>
      {status}
    </span>
  )
}
