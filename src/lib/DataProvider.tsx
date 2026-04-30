'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { setActiveClientCookie } from './active-client'

export type UserRole = 'admin' | 'client'

interface ListItem {
  id: number
  name: string
  type: string
  optin: string
  subscriber_count: number
  created_at: string
  _instance?: string
}

interface CampaignItem {
  id: number
  name: string
  subject: string
  status: string
  from_email: string
  created_at: string
  started_at: string | null
  views: number
  clicks: number
  bounces: number
  sent: number
  lists: { id: number; name: string }[]
  _instance?: string
}

interface ClientInstance {
  id: string
  name: string
}

interface DataContextType {
  lists: ListItem[]
  campaigns: CampaignItem[]
  listsLoading: boolean
  campaignsLoading: boolean
  userRole: UserRole | null
  userEmail: string | null
  allowedSections: string[] | null
  refreshLists: () => Promise<void>
  refreshCampaigns: () => Promise<void>
  instances: ClientInstance[]
  selectedInstanceId: string | null
  setSelectedInstanceId: (id: string | null) => void
}

const DataContext = createContext<DataContextType>({
  lists: [],
  campaigns: [],
  listsLoading: true,
  campaignsLoading: true,
  userRole: null,
  userEmail: null,
  allowedSections: null,
  refreshLists: async () => {},
  refreshCampaigns: async () => {},
  instances: [],
  selectedInstanceId: null,
  setSelectedInstanceId: () => {},
})

export function useData() {
  return useContext(DataContext)
}

async function fetchAllPages<T>(
  basePath: string,
  instanceId: string | null,
  onPage?: (results: T[]) => void
): Promise<T[]> {
  const allResults: T[] = []
  let page = 1
  const perPage = 100

  while (true) {
    try {
      const params = new URLSearchParams({ per_page: String(perPage), page: String(page) })
      if (instanceId) params.set('instance', instanceId)
      const res = await fetch(`/api/listmonk/${basePath}?${params.toString()}`)
      if (!res.ok) break
      const json = await res.json()
      const results = json.data?.results || []
      allResults.push(...results)
      if (onPage) onPage([...allResults])
      if (results.length < perPage) break
      page++
    } catch {
      break
    }
  }
  return allResults
}

export function DataProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [lists, setLists] = useState<ListItem[]>([])
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([])
  const [listsLoading, setListsLoading] = useState(true)
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [allowedSections, setAllowedSections] = useState<string[] | null>(null)
  const [instances, setInstances] = useState<ClientInstance[]>([])
  // Active client selection. For admins this is purely client-side state used
  // to scope frontend fetches via ?instance=. For client users it ALSO writes
  // a cookie so the server's session.clientId tracks the selection across all
  // 42-ish API routes that scope by clientId.
  const [selectedInstanceId, setSelectedInstanceIdState] = useState<string | null>(null)
  const setSelectedInstanceId = useCallback((id: string | null) => {
    setSelectedInstanceIdState(id)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedInstanceId')
    }
    // For client-role users we need the server to see the new active client
    // for subsequent requests — set the cookie + ask Next to re-render server
    // components with the new session. The /api/me refetch below also picks
    // up the new allowed_sections so the sidebar updates.
    if (userRole !== 'admin') {
      setActiveClientCookie(id)
      router.refresh()
      // Refetch /api/me so allowedSections reflects the new active client.
      fetch('/api/me')
        .then((r) => r.json())
        .then((data) => {
          if (data.allowedSections) setAllowedSections(data.allowedSections)
        })
        .catch(() => {})
    }
  }, [userRole, router])

  const refreshLists = useCallback(async () => {
    setListsLoading(true)
    setLists([])
    try {
      await fetchAllPages<ListItem>('lists', selectedInstanceId, (partial) => {
        setLists(partial)
        setListsLoading(false)
      })
    } catch {
      // ignore
    } finally {
      setListsLoading(false)
    }
  }, [selectedInstanceId])

  const refreshCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    setCampaigns([])
    try {
      await fetchAllPages<CampaignItem>('campaigns', selectedInstanceId, (partial) => {
        setCampaigns(partial)
        setCampaignsLoading(false)
      })
    } catch {
      // ignore
    } finally {
      setCampaignsLoading(false)
    }
  }, [selectedInstanceId])

  // Fetch user identity on mount.
  // For client-role users with multiple assigned clients, populate `instances`
  // and seed the selector with the active (= primary or cookie) client so the
  // navbar selector becomes available with no extra fetch.
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.role) setUserRole(data.role)
        if (data.email) setUserEmail(data.email)
        if (data.allowedSections) setAllowedSections(data.allowedSections)
        if (data.role !== 'admin' && Array.isArray(data.availableClients) && data.availableClients.length > 1) {
          setInstances(data.availableClients)
          // Seed the local selector with whichever client the server says is active,
          // so the dropdown shows the right value on first render.
          if (data.clientId) setSelectedInstanceIdState(data.clientId)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch available instances (admin only)
  useEffect(() => {
    if (userRole !== 'admin') return
    fetch('/api/settings/clients')
      .then((r) => r.json())
      .then((data) => {
        const clientList = Array.isArray(data) ? data : data.data || []
        // Only include clients with FULL Listmonk credentials (url + username + password)
        const withInstance = clientList
          .filter((c: { listmonk_url: string | null; listmonk_username: string | null; listmonk_password: string | null }) =>
            c.listmonk_url && c.listmonk_username && c.listmonk_password
          )
          .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
        setInstances(withInstance)
      })
      .catch(() => {})
  }, [userRole])

  // Refetch data when instance changes
  useEffect(() => {
    refreshLists()
    refreshCampaigns()
  }, [refreshLists, refreshCampaigns])

  return (
    <DataContext.Provider
      value={{
        lists,
        campaigns,
        listsLoading,
        campaignsLoading,
        userRole,
        userEmail,
        allowedSections,
        refreshLists,
        refreshCampaigns,
        instances,
        selectedInstanceId,
        setSelectedInstanceId,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
