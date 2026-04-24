'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

type Tab = 'clients' | 'users' | 'resources'

interface Client {
  id: string
  name: string
  slug: string
  owner_email: string
  listmonk_url?: string
  listmonk_username?: string
  listmonk_password?: string
  wordpress_url?: string | null
  wordpress_username?: string | null
  wordpress_password?: string | null
  apollo_api_key?: string | null
  sender_domain?: string | null
  sourcing_window_day_open?: number | null
  sourcing_window_day_close?: number | null
  allowed_sections?: string[]
  created_at: string
  assigned_lists?: number
  user_count?: number
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const CLIENT_SECTIONS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'lists', label: 'Lists' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'sourcing', label: 'Sourcing' },
    { key: 'stats', label: 'Stats' },
  ]

  const [form, setForm] = useState({
    name: '',
    slug: '',
    owner_email: '',
    listmonk_url: '',
    listmonk_username: '',
    listmonk_password: '',
    wordpress_url: '',
    wordpress_username: '',
    wordpress_password: '',
    apollo_api_key: '',
    sender_domain: '',
    sourcing_window_day_open: '' as string,
    sourcing_window_day_close: '' as string,
    allowed_sections: ['dashboard', 'lists', 'campaigns', 'stats'] as string[],
  })

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

  function startEdit(client: Client) {
    setEditingId(client.id)
    setForm({
      name: client.name,
      slug: client.slug,
      owner_email: client.owner_email,
      listmonk_url: client.listmonk_url || '',
      listmonk_username: client.listmonk_username || '',
      listmonk_password: '',
      wordpress_url: client.wordpress_url || '',
      wordpress_username: client.wordpress_username || '',
      wordpress_password: '',
      apollo_api_key: '',
      sender_domain: client.sender_domain || '',
      sourcing_window_day_open:
        client.sourcing_window_day_open == null ? '' : String(client.sourcing_window_day_open),
      sourcing_window_day_close:
        client.sourcing_window_day_close == null ? '' : String(client.sourcing_window_day_close),
      allowed_sections: client.allowed_sections ?? ['dashboard', 'lists', 'campaigns', 'stats'],
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({
      name: '',
      slug: '',
      owner_email: '',
      listmonk_url: '',
      listmonk_username: '',
      listmonk_password: '',
      wordpress_url: '',
      wordpress_username: '',
      wordpress_password: '',
      apollo_api_key: '',
      sender_domain: '',
      sourcing_window_day_open: '',
      sourcing_window_day_close: '',
      allowed_sections: ['dashboard', 'lists', 'campaigns', 'stats'],
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (editingId) {
        // Update existing client
        const payload: Record<string, unknown> = { id: editingId, ...form }
        // Don't send empty password (keep existing)
        if (!payload.listmonk_password) delete payload.listmonk_password
        // Don't overwrite existing secrets with blank values
        if (!payload.wordpress_password) delete payload.wordpress_password
        if (!payload.apollo_api_key) delete payload.apollo_api_key
        const res = await fetch('/api/settings/clients', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setSuccess('Client updated successfully')
      } else {
        // Create new client
        const res = await fetch('/api/settings/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setSuccess('Client created successfully')
      }
      cancelForm()
      fetchClients()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : editingId ? 'Failed to update client' : 'Failed to create client')
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

      <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-custom">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase">
            Clients
          </h2>
          <button
            onClick={() => { if (showForm) { cancelForm() } else { setEditingId(null); setShowForm(true) } }}
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
                <th className="text-left px-5 py-3 font-medium">Owner Email</th>
                <th className="text-center px-5 py-3 font-medium">Lists</th>
                <th className="text-center px-5 py-3 font-medium">Users</th>
                <th className="text-left px-5 py-3 font-medium">Created</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-4">
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
                    colSpan={6}
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
                    <td className="px-5 py-3">
                      <p className="text-sm text-navy font-medium">{client.name}</p>
                      <p className="text-xs text-text-light">{client.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-mid">
                      {client.owner_email}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${
                        (client.assigned_lists || 0) > 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {client.assigned_lists || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block rounded-lg px-2 py-0.5 text-xs font-medium bg-accent-wash text-accent">
                        {client.user_count || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-light">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => startEdit(client)}
                          className="text-xs text-accent hover:text-accent-bright font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete client "${client.name}"? This will also remove all their resource assignments.`)) return
                            try {
                              const res = await fetch('/api/settings/clients', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: client.id }),
                              })
                              if (!res.ok) { const json = await res.json(); throw new Error(json.error) }
                              setSuccess('Client deleted')
                              fetchClients()
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : 'Failed to delete')
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="bg-surface rounded-xl border border-border-custom p-5">
          <h2 className="font-display text-xl tracking-wide text-navy uppercase mb-4">
            {editingId ? 'Edit Client' : 'New Client'}
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

            <div className="border-t border-border-custom pt-4 mt-2">
              <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-3">Listmonk Connection</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Listmonk URL
                  </label>
                  <input
                    type="text"
                    value={form.listmonk_url}
                    onChange={(e) => setForm({ ...form, listmonk_url: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="https://mail.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Listmonk Username
                  </label>
                  <input
                    type="text"
                    value={form.listmonk_username}
                    onChange={(e) => setForm({ ...form, listmonk_username: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Listmonk Password
                  </label>
                  <input
                    type="password"
                    value={form.listmonk_password}
                    onChange={(e) => setForm({ ...form, listmonk_password: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <p className="text-xs text-text-light mt-2">
                Leave blank to use the default Listmonk instance. Fill in to connect this client to their own Listmonk.
              </p>
            </div>

            <div className="border-t border-border-custom pt-4 mt-2">
              <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-3">Bounce Routing</p>
              <div>
                <label className="block text-sm font-medium text-text-mid mb-1">
                  Sender Domain
                </label>
                <input
                  type="text"
                  value={form.sender_domain}
                  onChange={(e) => setForm({ ...form, sender_domain: e.target.value })}
                  className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="example.com"
                />
                <p className="text-xs text-text-light mt-2">
                  Bounce webhooks from Hyvor are routed back to this client&rsquo;s Listmonk when the email&rsquo;s sender domain matches.
                  Leave blank to route to the default Listmonk instance.
                </p>
              </div>
            </div>

            <div className="border-t border-border-custom pt-4 mt-2">
              <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-3">WordPress</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    WordPress URL
                  </label>
                  <input
                    type="text"
                    value={form.wordpress_url}
                    onChange={(e) => setForm({ ...form, wordpress_url: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="https://blog.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    WordPress Username
                  </label>
                  <input
                    type="text"
                    value={form.wordpress_username}
                    onChange={(e) => setForm({ ...form, wordpress_username: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    WordPress App Password
                  </label>
                  <input
                    type="password"
                    value={form.wordpress_password}
                    onChange={(e) => setForm({ ...form, wordpress_password: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <p className="text-xs text-text-light mt-2">
                Used to publish campaigns as WordPress posts. Generate an Application Password in WordPress under Users → Your Profile → Application Passwords.
              </p>
            </div>

            <div className="border-t border-border-custom pt-4 mt-2">
              <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-3">Sourcing Database</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Sourcing API Key
                  </label>
                  <input
                    type="password"
                    value={form.apollo_api_key}
                    onChange={(e) => setForm({ ...form, apollo_api_key: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Sourcing Window Opens
                  </label>
                  <select
                    value={form.sourcing_window_day_open}
                    onChange={(e) => setForm({ ...form, sourcing_window_day_open: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">Always open</option>
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-mid mb-1">
                    Sourcing Window Closes
                  </label>
                  <select
                    value={form.sourcing_window_day_close}
                    onChange={(e) => setForm({ ...form, sourcing_window_day_close: e.target.value })}
                    className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">Always open</option>
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-text-light mt-2">
                Sourcing API key is stored encrypted and only used server-side. Leave blank when editing to keep the existing key. Set both window days to Always open to let this client submit any time.
              </p>
            </div>

            <div className="border-t border-border-custom pt-4 mt-2">
              <p className="text-xs text-text-light uppercase tracking-wider font-medium mb-3">Visible Sections</p>
              <p className="text-xs text-text-light mb-3">
                Choose which sections this client can see in their navigation. Unchecked sections will be hidden.
              </p>
              <div className="flex flex-wrap gap-2">
                {CLIENT_SECTIONS.map((section) => {
                  const active = form.allowed_sections.includes(section.key)
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? form.allowed_sections.filter((k) => k !== section.key)
                          : [...form.allowed_sections, section.key]
                        setForm({ ...form, allowed_sections: next })
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-accent text-white'
                          : 'bg-offwhite text-text-mid hover:bg-border-custom'
                      }`}
                    >
                      {section.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-white hover:bg-accent-bright rounded-lg font-medium px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update Client' : 'Save Client'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="border border-border-custom text-text-mid hover:bg-surface rounded-lg px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>

            {editingId && (
              <p className="text-xs text-text-light mt-2">
                Leave Listmonk password blank to keep the existing one.
              </p>
            )}
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

      <div className="bg-surface rounded-xl border border-border-custom overflow-hidden">
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
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-4">
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
                    colSpan={5}
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
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete user "${user.email}"?`)) return
                          try {
                            const res = await fetch('/api/settings/users', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: user.id }),
                            })
                            const json = await res.json()
                            if (!res.ok) throw new Error(json.error)
                            setSuccess('User deleted')
                            fetchData()
                          } catch (err: unknown) {
                            setError(err instanceof Error ? err.message : 'Failed to delete')
                          }
                        }}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="bg-surface rounded-xl border border-border-custom p-5">
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
                className="border border-border-custom text-text-mid hover:bg-surface rounded-lg px-4 py-2 text-sm"
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
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [assignedListIds, setAssignedListIds] = useState<number[]>([])
  const [lists, setLists] = useState<{ id: number; name: string; subscriber_count: number }[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingResources, setLoadingResources] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [assignMode, setAssignMode] = useState<'code' | 'manual'>('code')
  const [pubCode, setPubCode] = useState('')
  const [applyingCode, setApplyingCode] = useState(false)

  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return lists
    const q = searchQuery.toLowerCase()
    return lists.filter((l) => l.name.toLowerCase().includes(q))
  }, [lists, searchQuery])

  // Lists matching the pub code for preview
  const codeMatchedLists = useMemo(() => {
    if (!pubCode.trim()) return []
    const code = pubCode.toUpperCase()
    return lists.filter((l) => l.name.toUpperCase().startsWith(code))
  }, [lists, pubCode])

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
    setLoadingLists(true)
    setLists([])
    setError(null)
    setPubCode('')

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

    fetch(`/api/settings/client-lists?client_id=${selectedClientId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error)
        } else if (json.data) {
          setLists(json.data)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load lists from Listmonk'))
      .finally(() => setLoadingLists(false))
  }, [selectedClientId])

  async function applyByCode() {
    if (!pubCode.trim() || codeMatchedLists.length === 0) return
    setApplyingCode(true)
    setError(null)

    try {
      // Find lists to add (matched but not assigned) and lists to remove (assigned but not matched)
      const matchedIds = new Set(codeMatchedLists.map((l) => l.id))
      const toAdd = codeMatchedLists.filter((l) => !assignedListIds.includes(l.id))
      const toRemove = assignedListIds.filter((id) => !matchedIds.has(id))

      // Add new ones
      for (const list of toAdd) {
        await fetch('/api/settings/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, resourceType: 'list', listmonkId: list.id, label: list.name }),
        })
      }

      // Remove old ones not matching the code
      for (const listId of toRemove) {
        await fetch('/api/settings/resources', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, resourceType: 'list', listmonkId: listId }),
        })
      }

      setAssignedListIds(Array.from(matchedIds))
      setSuccess(`Assigned ${codeMatchedLists.length} lists matching "${pubCode.toUpperCase()}"`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply')
    } finally {
      setApplyingCode(false)
    }
  }

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
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 px-4 py-3 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border-custom p-5">
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
        <div className="bg-surface rounded-xl border border-border-custom p-5 space-y-4">
          {loadingResources || loadingLists ? (
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

              {/* Mode toggle */}
              <div className="flex gap-3">
                <button
                  onClick={() => setAssignMode('code')}
                  className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    assignMode === 'code'
                      ? 'border-accent bg-accent-wash text-accent'
                      : 'border-border-custom text-text-mid hover:bg-offwhite'
                  }`}
                >
                  By publication code
                </button>
                <button
                  onClick={() => setAssignMode('manual')}
                  className={`flex-1 p-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    assignMode === 'manual'
                      ? 'border-accent bg-accent-wash text-accent'
                      : 'border-border-custom text-text-mid hover:bg-offwhite'
                  }`}
                >
                  Select individually
                </button>
              </div>

              {/* By publication code */}
              {assignMode === 'code' && (
                <div className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-text-mid mb-1">Publication Code</label>
                      <input
                        type="text"
                        value={pubCode}
                        onChange={(e) => setPubCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                        placeholder="e.g. EIT"
                        className="w-full max-w-[120px] px-3 py-2 border border-border-custom rounded-lg text-navy font-mono text-center uppercase placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={applyByCode}
                      disabled={!pubCode.trim() || codeMatchedLists.length === 0 || applyingCode}
                      className="px-4 py-2 bg-accent text-white hover:bg-accent-bright rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
                    >
                      {applyingCode ? 'Applying...' : `Assign ${codeMatchedLists.length} lists`}
                    </button>
                  </div>

                  {pubCode && (
                    <div className="bg-offwhite rounded-lg border border-border-custom p-3">
                      {codeMatchedLists.length === 0 ? (
                        <p className="text-sm text-text-light">No lists found starting with &quot;{pubCode}&quot;</p>
                      ) : (
                        <>
                          <p className="text-xs text-text-light mb-2">
                            {codeMatchedLists.length} list{codeMatchedLists.length !== 1 ? 's' : ''} matching &quot;{pubCode}&quot;:
                          </p>
                          {codeMatchedLists.slice(0, 8).map((l) => (
                            <div key={l.id} className="flex items-center justify-between py-1 text-sm">
                              <span className="text-text-mid">{l.name}</span>
                              <span className="text-xs text-text-light">{l.subscriber_count.toLocaleString()} subs</span>
                            </div>
                          ))}
                          {codeMatchedLists.length > 8 && (
                            <p className="text-xs text-text-light mt-1">...and {codeMatchedLists.length - 8} more</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-text-light">
                    This will assign all lists starting with the code and remove any previously assigned lists that don&apos;t match.
                  </p>
                </div>
              )}

              {/* Manual selection */}
              {assignMode === 'manual' && (
                <>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
