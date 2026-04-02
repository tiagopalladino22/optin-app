'use client'

import { useState, useEffect } from 'react'
import CsvImport from '@/components/lists/CsvImport'
import { useData } from '@/lib/DataProvider'

interface Client {
  id: string
  name: string
  listmonk_url: string | null
}

export default function ImportPage() {
  const { userRole } = useData()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  useEffect(() => {
    if (userRole !== 'admin') return
    fetch('/api/settings/clients')
      .then((res) => res.json())
      .then((data) => {
        const clientList = Array.isArray(data) ? data : data.data || []
        // Only show clients with their own Listmonk instance
        const withListmonk = clientList.filter((c: Client) => c.listmonk_url)
        setClients(withListmonk)
      })
      .catch(() => {})
  }, [userRole])

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Import Subscribers</h1>

      {userRole === 'admin' && clients.length > 0 && (
        <div className="bg-white rounded-xl border border-border-custom p-4">
          <label className="block text-sm font-medium text-text-mid mb-2">Listmonk Instance</label>
          <select
            value={selectedClientId || ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="">Default (optin150.com)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.listmonk_url}
              </option>
            ))}
          </select>
        </div>
      )}

      <CsvImport key={selectedClientId || 'default'} clientId={selectedClientId || undefined} />
    </div>
  )
}
