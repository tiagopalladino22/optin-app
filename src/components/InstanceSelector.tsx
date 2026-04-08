'use client'

import { useData } from '@/lib/DataProvider'

export default function InstanceSelector() {
  const { instances, selectedInstanceId, setSelectedInstanceId, userRole } = useData()

  // Only show for admins with at least one client instance
  if (userRole !== 'admin' || instances.length === 0) return null

  return (
    <select
      value={selectedInstanceId || ''}
      onChange={(e) => setSelectedInstanceId(e.target.value || null)}
      className="px-3 py-2 border border-border-custom rounded-lg text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
      title="Listmonk instance"
    >
      <option value="">Default (optin150)</option>
      {instances.map((inst) => (
        <option key={inst.id} value={inst.id}>
          {inst.name}
        </option>
      ))}
    </select>
  )
}
