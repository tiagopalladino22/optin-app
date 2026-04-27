import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Per-client unified Hyvor webhook. Each client's Hyvor project has its own
// webhook subscribed to all 3 events (accepted/bounced/complained) pointed
// at /api/webhooks/hyvor-bounce/<clientId>. We verify the HMAC against the
// secret stored on that client and dispatch by event type.
//
// Default-instance traffic still uses the flat /api/webhooks/hyvor-bounce
// route with env-var secrets.

interface HyvorPayload {
  event?: string
  payload: {
    send: {
      id: number
      uuid: string
      subject: string
      from_address: string
      headers: Record<string, string>
    }
    recipient: {
      address: string
      status: string
    }
    attempt?: {
      created_at?: number | string
      recipients?: Array<{
        smtp_code: number
        smtp_message: string
      }>
    } | null
    complaint?: {
      type?: string
    }
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

function headerLookup(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

function getBounceType(smtpCode: number): 'hard' | 'soft' {
  return smtpCode >= 500 ? 'hard' : 'soft'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const rawBody = await request.text()

  const supabase = await createServiceRoleClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, hyvor_webhook_secret, listmonk_url, listmonk_username, listmonk_password')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Unknown clientId' }, { status: 404 })
  }
  if (!client.hyvor_webhook_secret) {
    console.error(`[hyvor:${client.name}] hyvor_webhook_secret not set on client`)
    return NextResponse.json({ error: 'Webhook secret not configured for client' }, { status: 401 })
  }

  const signature = request.headers.get('x-signature') ?? ''
  if (!verifySignature(rawBody, signature, client.hyvor_webhook_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: HyvorPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event ?? request.headers.get('x-event') ?? ''
  const { send, recipient, attempt, complaint } = payload.payload

  // ─────────────────────────────────────────────────────────────────
  // Event: send.recipient.accepted → store delivery timestamp
  // ─────────────────────────────────────────────────────────────────
  if (eventType === 'send.recipient.accepted') {
    if (!recipient?.address || !send?.uuid) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const headers = send?.headers ?? {}
    const campaignUuid = headerLookup(headers, 'X-Listmonk-Campaign') ?? null
    const subscriberUuid = headerLookup(headers, 'X-Listmonk-Subscriber') ?? null

    const acceptedAt =
      typeof attempt?.created_at === 'number'
        ? new Date(attempt.created_at * 1000).toISOString()
        : typeof attempt?.created_at === 'string'
          ? attempt.created_at
          : new Date().toISOString()

    const { error } = await supabase
      .from('email_deliveries')
      .upsert(
        {
          client_id: client.id,
          email: recipient.address.toLowerCase(),
          campaign_uuid: campaignUuid,
          subscriber_uuid: subscriberUuid,
          delivered_at: acceptedAt,
          hyvor_send_uuid: send.uuid,
        },
        { onConflict: 'hyvor_send_uuid' }
      )

    if (error) {
      console.error(`[hyvor:${client.name}] accepted upsert failed:`, error)
    }
    return NextResponse.json({ ok: true })
  }

  // ─────────────────────────────────────────────────────────────────
  // Event: send.recipient.bounced → forward to this client's Listmonk
  // ─────────────────────────────────────────────────────────────────
  if (eventType === 'send.recipient.bounced') {
    if (!recipient?.address) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const smtpCode = attempt?.recipients?.[0]?.smtp_code ?? 550
    const smtpMessage = attempt?.recipients?.[0]?.smtp_message ?? ''
    const headers = send?.headers ?? {}
    const campaignUuid = headerLookup(headers, 'X-Listmonk-Campaign')
    const subscriberUuid = headerLookup(headers, 'X-Listmonk-Subscriber')

    const listmonkBody: Record<string, unknown> = {
      email: recipient.address,
      source: 'api',
      type: getBounceType(smtpCode),
      meta: JSON.stringify({
        smtp_code: smtpCode,
        smtp_message: smtpMessage,
        hyvor_send_uuid: send?.uuid,
      }),
    }
    if (campaignUuid) listmonkBody.campaign_uuid = campaignUuid
    if (subscriberUuid) listmonkBody.subscriber_uuid = subscriberUuid

    if (!campaignUuid) {
      console.warn(
        `[hyvor:${client.name}] No X-Listmonk-Campaign header for bounce ${recipient.address}. ` +
        `Available headers: ${Object.keys(headers).join(', ')}`
      )
    }

    await forwardToListmonk(client, listmonkBody, 'bounced')
    return NextResponse.json({ ok: true })
  }

  // ─────────────────────────────────────────────────────────────────
  // Event: send.recipient.complained → forward as complaint-type bounce
  // ─────────────────────────────────────────────────────────────────
  if (eventType === 'send.recipient.complained') {
    if (!recipient?.address) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const headers = send?.headers ?? {}
    const campaignUuid = headerLookup(headers, 'X-Listmonk-Campaign')
    const subscriberUuid = headerLookup(headers, 'X-Listmonk-Subscriber')

    const listmonkBody: Record<string, unknown> = {
      email: recipient.address,
      source: 'api',
      type: 'complaint',
      meta: JSON.stringify({
        complaint_type: complaint?.type,
        hyvor_send_uuid: send?.uuid,
      }),
    }
    if (campaignUuid) listmonkBody.campaign_uuid = campaignUuid
    if (subscriberUuid) listmonkBody.subscriber_uuid = subscriberUuid

    await forwardToListmonk(client, listmonkBody, 'complained')
    return NextResponse.json({ ok: true })
  }

  // Any other event — silently OK so Hyvor doesn't retry
  return NextResponse.json({ ok: true, skipped: true, event: eventType })
}

async function forwardToListmonk(
  client: { name: string; listmonk_url: string | null; listmonk_username: string | null; listmonk_password: string | null },
  body: Record<string, unknown>,
  eventLabel: string,
) {
  if (!client.listmonk_url || !client.listmonk_username || !client.listmonk_password) {
    console.error(`[hyvor:${client.name}] Listmonk credentials missing on client — cannot forward ${eventLabel}`)
    return
  }
  try {
    const credentials = Buffer.from(`${client.listmonk_username}:${client.listmonk_password}`).toString('base64')
    const res = await fetch(`${client.listmonk_url}/webhooks/bounce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[hyvor:${client.name}] Listmonk returned ${res.status} for ${eventLabel}: ${text}`)
    }
  } catch (err) {
    console.error(`[hyvor:${client.name}] Failed to forward ${eventLabel} to Listmonk:`, err)
  }
}
