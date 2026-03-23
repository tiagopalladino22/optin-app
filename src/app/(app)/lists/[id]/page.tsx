'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import CsvImport from '@/components/lists/CsvImport'

interface ListDetail {
  id: number
  name: string
  type: string
  optin: string
  subscriber_count: number
  description: string
  tags: string[]
  created_at: string
}

export default function ListDetailPage() {
  const params = useParams()
  const [list, setList] = useState<ListDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch(`/api/listmonk/lists/${params.id}`)
        const data = await res.json()
        setList(data.data)
      } catch (err) {
        console.error('Failed to fetch list:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchList()
  }, [params.id])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
      </div>
    )
  }

  if (!list) {
    return <p className="text-text-mid">List not found.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/lists" className="text-sm text-text-light hover:text-text-mid mb-1 block">
            &larr; Back to Lists
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-navy uppercase">{list.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <p className="text-xs text-text-light uppercase tracking-wider mb-1">Subscribers</p>
          <p className="font-display text-3xl text-navy">
            {list.subscriber_count.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <p className="text-xs text-text-light uppercase tracking-wider mb-1">Type</p>
          <p className="font-display text-3xl text-navy capitalize">{list.type}</p>
        </div>
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <p className="text-xs text-text-light uppercase tracking-wider mb-1">Opt-in</p>
          <p className="font-display text-3xl text-navy capitalize">{list.optin}</p>
        </div>
      </div>

      {list.description && (
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <h2 className="text-sm font-medium text-text-mid mb-2">Description</h2>
          <p className="text-text-mid">{list.description}</p>
        </div>
      )}

      <CsvImport listId={list.id} />
    </div>
  )
}
