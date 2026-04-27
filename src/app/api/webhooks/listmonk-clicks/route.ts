import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Receives batches of click events pushed from each Listmonk server's cron job.
// The cron queries Listmonk's local Postgres and POSTs new clicks here.
//
// Auth: Bearer token shared between OPTIN and the cron script. The script
// passes ?clientId=<uuid> identifying which client's Listmonk it ran on.

interface ClickBatchItem {
  id: number                  // listmonk link_clicks.id (cursor for incremental sync)
  campaign_uuid: string
  subscriber_uuid: string
  email: string
  url?: string | null
  created_at: string          // ISO timestamp
}

function verifyBearer(request: NextRequest): boolean {
  const expected = process.env.LISTMONK_CLICKS_WEBHOOK_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.LISTMONK_CLICKS_WEBHOOK_SECRET) {
    console.error('[listmonk-clicks] LISTMONK_CLICKS_WEBHOOK_SECRET not set — rejecting')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }
  if (!verifyBearer(request)) {
    return NextResponse.json({ error: 'Invalid bearer token' }, { status: 401 })
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId query param is required' }, { status: 400 })
  }

  let body: { clicks: ClickBatchItem[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clicks = Array.isArray(body?.clicks) ? body.clicks : []
  if (clicks.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: 0 })
  }

  const supabase = await createServiceRoleClient()

  // Verify clientId is real (cheap lookup that also blocks junk client IDs from
  // creating orphan rows).
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (!clientRow) {
    return NextResponse.json({ error: 'Unknown clientId' }, { status: 400 })
  }

  const rows = clicks
    .filter((c) => c?.id && c.campaign_uuid && c.subscriber_uuid && c.email && c.created_at)
    .map((c) => ({
      client_id: clientId,
      listmonk_click_id: c.id,
      campaign_uuid: c.campaign_uuid,
      subscriber_uuid: c.subscriber_uuid,
      subscriber_email: c.email.toLowerCase(),
      url: c.url || null,
      clicked_at: c.created_at,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: clicks.length })
  }

  const { error, count } = await supabase
    .from('email_clicks')
    .upsert(rows, { onConflict: 'client_id,listmonk_click_id', count: 'exact' })

  if (error) {
    console.error('[listmonk-clicks] Failed to upsert batch:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the highest listmonk_click_id in this batch so the cron can advance
  // its cursor reliably (in case its local state file got out of sync).
  const maxId = Math.max(...clicks.map((c) => c.id))
  return NextResponse.json({ ok: true, inserted: count ?? rows.length, max_id: maxId })
}
