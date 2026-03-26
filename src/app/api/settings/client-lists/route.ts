import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET /api/settings/client-lists?client_id=xxx
// Fetches lists from the client's Listmonk instance (or default if no custom credentials)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()
  const { data: client } = await supabase
    .from('clients')
    .select('listmonk_url, listmonk_username, listmonk_password')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Determine which Listmonk instance to use (strip trailing slashes)
  const listmonkUrl = (client.listmonk_url || process.env.LISTMONK_URL!).replace(/\/+$/, '')
  const username = client.listmonk_username || process.env.LISTMONK_USERNAME!
  const password = client.listmonk_password || process.env.LISTMONK_PASSWORD!
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')

  // Fetch all lists from this client's Listmonk instance
  const allLists: { id: number; name: string; subscriber_count: number }[] = []
  let page = 1

  while (true) {
    try {
      const res = await fetch(`${listmonkUrl}/api/lists?per_page=100&page=${page}`, {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json(
          { error: `Listmonk error: ${res.status} ${text.slice(0, 100)}` },
          { status: 502 }
        )
      }
      const data = await res.json()
      const results = data.data?.results || []
      for (const l of results) {
        allLists.push({ id: l.id, name: l.name, subscriber_count: l.subscriber_count })
      }
      if (results.length < 100) break
      page++
    } catch (err) {
      return NextResponse.json(
        { error: `Could not connect to Listmonk at ${listmonkUrl}: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 502 }
      )
    }
  }

  return NextResponse.json({ data: allLists })
}
