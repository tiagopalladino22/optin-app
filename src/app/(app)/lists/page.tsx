'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Pagination from '@/components/ui/Pagination'
import InstanceSelector from '@/components/InstanceSelector'
import { useData } from '@/lib/DataProvider'

const PER_PAGE = 10

export default function ListsPage() {
  const { lists, listsLoading } = useData()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filteredLists = useMemo(() => {
    if (!search.trim()) return lists
    const q = search.toLowerCase()
    return lists.filter((l) => l.name.toLowerCase().includes(q))
  }, [lists, search])

  const totalPages = Math.ceil(filteredLists.length / PER_PAGE)
  const paginatedLists = useMemo(
    () => filteredLists.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filteredLists, page]
  )

  useEffect(() => setPage(1), [search])

  if (listsLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Lists</h1>
        <div className="flex items-center gap-3">
          <InstanceSelector />
          <Link
            href="/lists/new"
            className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm transition-colors"
          >
            Create List
          </Link>
        </div>
      </div>

      {lists.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lists..."
          className="block w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
        />
      )}

      {filteredLists.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-custom p-12 text-center">
          <p className="text-text-mid">
            {search ? 'No lists match your search.' : 'No lists yet. Create your first list to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-custom bg-offwhite">
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Opt-in</th>
                  <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Subscribers</th>
                  <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLists.map((list) => (
                  <tr key={list.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                    <td className="px-4 py-3">
                      <Link href={`/lists/${list.id}`} className="text-accent hover:text-accent-bright font-medium">
                        {list.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-mid">{list.type}</td>
                    <td className="px-4 py-3 text-text-mid">{list.optin}</td>
                    <td className="px-4 py-3 text-right text-navy font-medium">
                      {list.subscriber_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-text-light">
                      {new Date(list.created_at).toLocaleDateString()}
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
