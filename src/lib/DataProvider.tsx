'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export type UserRole = 'admin' | 'client'

interface ListItem {
  id: number
  name: string
  type: string
  optin: string
  subscriber_count: number
  created_at: string
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
}

interface DataContextType {
  lists: ListItem[]
  campaigns: CampaignItem[]
  listsLoading: boolean
  campaignsLoading: boolean
  userRole: UserRole | null
  refreshLists: () => Promise<void>
  refreshCampaigns: () => Promise<void>
}

const DataContext = createContext<DataContextType>({
  lists: [],
  campaigns: [],
  listsLoading: true,
  campaignsLoading: true,
  userRole: null,
  refreshLists: async () => {},
  refreshCampaigns: async () => {},
})

export function useData() {
  return useContext(DataContext)
}

// Fetch all pages from a paginated Listmonk endpoint
// onPage callback allows progressive rendering as pages arrive
async function fetchAllPages<T>(
  basePath: string,
  onPage?: (results: T[]) => void
): Promise<T[]> {
  const allResults: T[] = []
  let page = 1
  const perPage = 100

  while (true) {
    try {
      const res = await fetch(`/api/listmonk/${basePath}?per_page=${perPage}&page=${page}`)
      if (!res.ok) break
      const json = await res.json()
      const results = json.data?.results || []
      allResults.push(...results)

      // Notify with results so far (enables progressive rendering)
      if (onPage) onPage([...allResults])

      // If we got fewer than perPage, we've reached the last page
      if (results.length < perPage) break
      page++
    } catch {
      break
    }
  }

  return allResults
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<ListItem[]>([])
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([])
  const [listsLoading, setListsLoading] = useState(true)
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  const refreshLists = useCallback(async () => {
    try {
      await fetchAllPages<ListItem>('lists', (partial) => {
        setLists(partial)
        setListsLoading(false) // Show data as soon as first page arrives
      })
    } catch {
      // ignore
    } finally {
      setListsLoading(false)
    }
  }, [])

  const refreshCampaigns = useCallback(async () => {
    try {
      await fetchAllPages<CampaignItem>('campaigns', (partial) => {
        setCampaigns(partial)
        setCampaignsLoading(false) // Show data as soon as first page arrives
      })
    } catch {
      // ignore
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  // Fetch user role on mount
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => { if (data.role) setUserRole(data.role) })
      .catch(() => {})
  }, [])

  // Preload both on mount
  useEffect(() => {
    refreshLists()
    refreshCampaigns()
  }, [refreshLists, refreshCampaigns])

  return (
    <DataContext.Provider
      value={{ lists, campaigns, listsLoading, campaignsLoading, userRole, refreshLists, refreshCampaigns }}
    >
      {children}
    </DataContext.Provider>
  )
}
