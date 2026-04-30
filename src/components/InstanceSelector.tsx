'use client'

import { useData } from '@/lib/DataProvider'

export default function InstanceSelector() {
  const { instances, selectedInstanceId, setSelectedInstanceId, userRole } = useData()

  // Show whenever the user has more than one instance to pick from (admins always do
  // if at least one client has full Listmonk creds; client users only if assigned to 2+).
  if (instances.length === 0) return null

  return (
    <select
      value={selectedInstanceId || ''}
      onChange={(e) => setSelectedInstanceId(e.target.value || null)}
      className="px-3 py-2 border border-border-custom rounded-lg text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
      title="Listmonk instance"
    >
      {/* Admins get a "Default" option targeting the env-var Listmonk; client users
          only see their assigned clients (no implicit access to the default). */}
      {userRole === 'admin' && <option value="">Default (optin150)</option>}
      {instances.map((inst) => (
        <option key={inst.id} value={inst.id}>
          {inst.name}
        </option>
      ))}
    </select>
  )
}
