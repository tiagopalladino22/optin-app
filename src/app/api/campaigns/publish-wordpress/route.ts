import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'

// POST /api/campaigns/publish-wordpress
// Body: { campaignId: number, instanceId?: string }
// Fetches the campaign HTML from Listmonk and publishes it as a WordPress post.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { campaignId, instanceId } = body

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Determine which client to use for WordPress credentials.
  // If an instanceId is provided (admin viewing another client's instance),
  // use that client. Otherwise use the session's client.
  const wpClientId = instanceId || session.clientId
  if (!wpClientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select(
      'wordpress_url, wordpress_username, wordpress_password, listmonk_url, listmonk_username, listmonk_password'
    )
    .eq('id', wpClientId)
    .single()

  if (!client?.wordpress_url || !client?.wordpress_username || !client?.wordpress_password) {
    return NextResponse.json(
      { error: 'WordPress credentials not configured for this client' },
      { status: 400 }
    )
  }

  // Fetch the campaign from Listmonk
  const fetchFn =
    instanceId && client.listmonk_url && client.listmonk_username && client.listmonk_password
      ? createClientListmonkFetch({
          url: client.listmonk_url,
          username: client.listmonk_username,
          password: client.listmonk_password,
        })
      : listmonkFetch

  let campaignSubject: string
  let campaignBody: string
  try {
    const res = await fetchFn(`campaigns/${campaignId}`)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch campaign from Listmonk' }, { status: 502 })
    }
    const json = await res.json()
    const campaign = json.data
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    campaignSubject = campaign.subject || campaign.name || 'Untitled'
    campaignBody = campaign.body || ''
  } catch (err) {
    console.error('[publish-wordpress] Listmonk fetch failed', err)
    return NextResponse.json({ error: 'Listmonk is not responding' }, { status: 504 })
  }

  if (!campaignBody.trim()) {
    return NextResponse.json({ error: 'Campaign has no HTML body' }, { status: 400 })
  }

  // Publish to WordPress
  const wpUrl = client.wordpress_url.replace(/\/+$/, '')
  const wpAuth = Buffer.from(
    `${client.wordpress_username}:${client.wordpress_password}`
  ).toString('base64')

  try {
    const wpRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${wpAuth}`,
      },
      body: JSON.stringify({
        title: campaignSubject,
        content: campaignBody,
        status: 'publish',
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!wpRes.ok) {
      const text = await wpRes.text()
      console.error('[publish-wordpress] WordPress error', wpRes.status, text)
      return NextResponse.json(
        { error: `WordPress returned ${wpRes.status}`, details: text },
        { status: 502 }
      )
    }

    const wpPost = await wpRes.json()
    return NextResponse.json({
      success: true,
      post: {
        id: wpPost.id,
        link: wpPost.link,
        title: wpPost.title?.rendered,
      },
    })
  } catch (err) {
    console.error('[publish-wordpress] WordPress fetch failed', err)
    return NextResponse.json({ error: 'WordPress is not responding' }, { status: 504 })
  }
}
