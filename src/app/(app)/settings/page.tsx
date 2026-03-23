'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useData } from '@/lib/DataProvider'

type Tab = 'clients' | 'users' | 'resources'

interface Client {
  id: string
  name: string
  slug: string
  owner_email: string
  created_at: string
}

interface User {
  id: string
  email: string
  role: string
  clientId: string | null
  clientName: string | null
  createdAt: string
}

interface ClientResource {
  id: string
  client_id: string
  resource_type: string
  listmonk_id: number
  label: string | null
}


export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('clients')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'clients', label: 'Clients' },
    { key: 'users', label: 'Users' },
    { key: 'resources', label: 'Resources' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-wide text-navy uppercase">
        Settings
      </h1>

      <div className="border-b border-border-custom">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-text-light hover:text-text-mid'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'clients' && <ClientsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'resources' && <ResourcesTab />}
    </div>
  )
}

/* ─── Clients Tab ─────────────────────────────────────────────── */

function ClientsTab() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', owner_email: '' })

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/clients')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setClients(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  function handleNameChange(name: string) {
    setForm({
      ...form,
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSuccess('Client created successfully')
      setForm({ name: '', slug: '', owner_email: '' })
      setShowForm(false)
      fetchClients()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 px-4 py-3 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-custom">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase">
            Clients
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-accent text-white hover:bg-accent-bright rounded-lg font-medium px-4 py-2 text-sm"
          >
            {showForm ? 'Cancel' : 'Add Client'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Slug</th>
                <th className="text-left px-5 py-3 font-medium">Owner Email</th>
                <th className="text-left px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-4">
                    <div className="space-y-3">
                      <div className="skeleton h-4 w-full" />
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-4 w-1/2" />
                    </div>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-text-light text-sm"
                  >
                    No clients yet
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-offwhite/50 border-b border-border-custom last:border-0"
                  >
                    <td className="px-5 py-3 text-sm text-navy font-medium">
                      {client.name}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-mid">
                      {client.slug}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-mid">
                      {client.owner_email}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-light">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">
            New Client
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="Acme Inc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="acme-inc"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Owner Email
                </label>
                <input
                  type="email"
                  value={form.owner_email}
                  onChange={(e) =>
                    setForm({ ...form, owner_email: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="owner@acme.com"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-white hover:bg-accent-bright rounded-lg font-medium px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Client'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-border-custom text-text-mid hover:bg-white rounded-lg px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─── Users Tab ───────────────────────────────────────────────── */

function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'client' as 'admin' | 'client',
    clientId: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, clientsRes] = await Promise.all([
        fetch('/api/settings/users'),
        fetch('/api/settings/clients'),
      ])
      const usersJson = await usersRes.json()
      const clientsJson = await clientsRes.json()
      if (!usersRes.ok) throw new Error(usersJson.error)
      if (!clientsRes.ok) throw new Error(clientsJson.error)
      setUsers(usersJson.data)
      setClients(clientsJson.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSuccess('User invited successfully')
      setForm({ email: '', password: '', role: 'client', clientId: '' })
      setShowForm(false)
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 px-4 py-3 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-custom">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase">
            Users
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-accent text-white hover:bg-accent-bright rounded-lg font-medium px-4 py-2 text-sm"
          >
            {showForm ? 'Cancel' : 'Invite User'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-offwhite text-text-light uppercase text-xs tracking-wider border-b border-border-custom">
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Role</th>
                <th className="text-left px-5 py-3 font-medium">Client</th>
                <th className="text-left px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-4">
                    <div className="space-y-3">
                      <div className="skeleton h-4 w-full" />
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-4 w-1/2" />
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-text-light text-sm"
                  >
                    No users yet
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-offwhite/50 border-b border-border-custom last:border-0"
                  >
                    <td className="px-5 py-3 text-sm text-navy font-medium">
                      {user.email}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-accent-wash text-accent'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-mid">
                      {user.clientName || '\u2014'}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-light">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-border-custom p-5">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">
            Invite User
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value as 'admin' | 'client',
                      clientId: e.target.value === 'admin' ? '' : form.clientId,
                    })
                  }
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Client
                </label>
                <select
                  value={form.clientId}
                  onChange={(e) =>
                    setForm({ ...form, clientId: e.target.value })
                  }
                  disabled={form.role === 'admin'}
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:bg-offwhite"
                >
                  <option value="">
                    {form.role === 'admin'
                      ? 'N/A for admins'
                      : 'Select a client'}
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-white hover:bg-accent-bright rounded-lg font-medium px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-border-custom text-text-mid hover:bg-white rounded-lg px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─── Resources Tab ───────────────────────────────────────────── */

function ResourcesTab() {
  const { lists: sharedLists, listsLoading } = useData()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [assignedListIds, setAssignedListIds] = useState<number[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingResources, setLoadingResources] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const lists = useMemo(
    () => sharedLists.map((l) => ({ id: l.id, name: l.name, subscriber_count: l.subscriber_count })),
    [sharedLists]
  )

  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return lists
    const q = searchQuery.toLowerCase()
    return lists.filter((l) => l.name.toLowerCase().includes(q))
  }, [lists, searchQuery])

  useEffect(() => {
    fetch('/api/settings/clients')
      .then((r) => r.json())
      .then((json) => { if (json.data) setClients(json.data) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients'))
      .finally(() => setLoadingClients(false))
  }, [])

  useEffect(() => {
    if (!selectedClientId) return
    setLoadingResources(true)
    fetch(`/api/settings/resources?client_id=${selectedClientId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setAssignedListIds(
            json.data
              .filter((r: ClientResource) => r.resource_type === 'list')
              .map((r: ClientResource) => r.listmonk_id)
          )
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load resources'))
      .finally(() => setLoadingResources(false))
  }, [selectedClientId])

  async function toggleList(listId: number, listName: string) {
    setTogglingIds((prev) => new Set(prev).add(listId))
    const assigned = assignedListIds.includes(listId)

    try {
      if (assigned) {
        const res = await fetch('/api/settings/resources', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, resourceType: 'list', listmonkId: listId }),
        })
        if (!res.ok) { const json = await res.json(); throw new Error(json.error) }
        setAssignedListIds((prev) => prev.filter((id) => id !== listId))
      } else {
        const res = await fetch('/api/settings/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, resourceType: 'list', listmonkId: listId, label: listName }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setAssignedListIds((prev) => [...prev, listId])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(listId); return next })
    }
  }

  const assignedCount = assignedListIds.length

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-border-custom p-5">
        <label className="block text-sm font-medium text-text-mid mb-1">Select Client</label>
        <p className="text-xs text-text-light mb-3">
          Assign Listmonk lists to a client. They will automatically see campaigns sent to their lists.
        </p>
        {loadingClients ? (
          <div className="skeleton h-10 w-64" />
        ) : (
          <select
            value={selectedClientId}
            onChange={(e) => { setSelectedClientId(e.target.value); setSearchQuery('') }}
            className="w-full max-w-xs px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="">Select a client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedClientId && (
        <div className="bg-white rounded-xl border border-border-custom p-5 space-y-4">
          {loadingResources || listsLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl tracking-wide text-navy uppercase">
                  Assign Lists
                </h2>
                <span className="text-sm text-text-light">
                  {assignedCount} of {lists.length} assigned
                </span>
              </div>

              {lists.length > 10 && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lists..."
                  className="block w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                />
              )}

              {filteredLists.length === 0 ? (
                <p className="text-sm text-text-light">
                  {searchQuery ? 'No lists match your search.' : 'No lists found in Listmonk.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredLists.map((list) => {
                    const toggling = togglingIds.has(list.id)
                    const checked = assignedListIds.includes(list.id)
                    return (
                      <label
                        key={list.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'border-accent bg-accent-wash'
                            : 'border-border-custom hover:bg-offwhite/50'
                        } ${toggling ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleList(list.id, list.name)}
                          disabled={toggling}
                          className="rounded border-border-custom text-accent focus:ring-accent"
                        />
                        <span className="flex-1 text-sm text-navy truncate">{list.name}</span>
                        <span className="text-xs text-text-light shrink-0">
                          {list.subscriber_count.toLocaleString()} subs
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
