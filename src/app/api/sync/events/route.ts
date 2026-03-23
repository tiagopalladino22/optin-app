import { NextRequest, NextResponse } from 'next/server'
import { listmonkFetch } from '@/lib/listmonk'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Background sync job: pulls campaign stats from Listmonk and stores
// them in the subscriber_events table for fast segment queries and reporting.
// Call this endpoint periodically (e.g. via cron or Vercel cron).
// Requires SYNC_SECRET env var for authentication.

export async function POST(request: NextRequest) {
  // Authenticate with a shared secret (not user auth, since this runs as a cron)
  const authHeader = request.headers.get('authorization')
  const syncSecret = process.env.SYNC_SECRET

  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  try {
    // Fetch all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id')

    if (clientsError || !clients) {
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }

    let totalSynced = 0

    for (const client of clients) {
      // Get campaigns owned by this client
      const { data: resources } = await supabase
        .from('client_resources')
        .select('listmonk_id')
        .eq('client_id', client.id)
        .eq('resource_type', 'campaign')

      if (!resources?.length) continue

      for (const resource of resources) {
        const campaignId = resource.listmonk_id

        // Fetch campaign details from Listmonk
        const campaignRes = await listmonkFetch(`campaigns/${campaignId}`)
        if (!campaignRes.ok) continue

        const campaignData = await campaignRes.json()
        const campaign = campaignData.data
        if (!campaign || campaign.status === 'draft') continue

        // Check what we already have for this campaign
        const { count: existingCount } = await supabase
          .from('subscriber_events')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client.id)
          .eq('campaign_id', campaignId)

        // If counts match, skip (no new events)
        const totalExpectedEvents =
          (campaign.sent || 0) +
          (campaign.views || 0) +
          (campaign.clicks || 0) +
          (campaign.bounces || 0)

        if (existingCount && existingCount >= totalExpectedEvents) continue

        // Clear old events for this campaign and re-insert aggregate stats.
        // Listmonk doesn't expose per-subscriber event streams, so we store
        // aggregate counts as synthetic events for reporting queries.
        await supabase
          .from('subscriber_events')
          .delete()
          .eq('client_id', client.id)
          .eq('campaign_id', campaignId)

        const events: {
          client_id: string
          subscriber_email: string
          campaign_id: number
          event_type: string
          occurred_at: string
        }[] = []

        const timestamp = campaign.started_at || campaign.created_at

        // Store aggregate counts as events
        if (campaign.sent > 0) {
          events.push({
            client_id: client.id,
            subscriber_email: `campaign_${campaignId}_aggregate`,
            campaign_id: campaignId,
            event_type: 'sent',
            occurred_at: timestamp,
          })
        }
        if (campaign.views > 0) {
          events.push({
            client_id: client.id,
            subscriber_email: `campaign_${campaignId}_aggregate`,
            campaign_id: campaignId,
            event_type: 'open',
            occurred_at: timestamp,
          })
        }
        if (campaign.clicks > 0) {
          events.push({
            client_id: client.id,
            subscriber_email: `campaign_${campaignId}_aggregate`,
            campaign_id: campaignId,
            event_type: 'click',
            occurred_at: timestamp,
          })
        }
        if (campaign.bounces > 0) {
          events.push({
            client_id: client.id,
            subscriber_email: `campaign_${campaignId}_aggregate`,
            campaign_id: campaignId,
            event_type: 'bounce',
            occurred_at: timestamp,
          })
        }

        if (events.length > 0) {
          await supabase.from('subscriber_events').insert(events)
          totalSynced += events.length
        }
      }
    }

    return NextResponse.json({ synced: totalSynced, clients: clients.length })
  } catch (err) {
    console.error('Sync failed:', err)
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    )
  }
}
