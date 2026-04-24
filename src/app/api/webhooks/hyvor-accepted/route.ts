import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Captures Hyvor's send.recipient.accepted event.
// We store (campaign_uuid, subscriber_uuid, delivered_at) so we know exactly
// when each recipient actually got each email. This is the baseline for
// click-bot detection ("time since delivery").

interface HyvorAcceptedPayload {
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
    attempt: {
      created_at?: number | string
      smtp_response?: string
    } | null
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

function extractDomain(fromAddress: string): string | null {
  const match = fromAddress.match(/<([^>]+)>/) ?? [null, fromAddress.trim()]
  const email = (match[1] ?? '').trim()
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).trim().toLowerCase()
}

function headerLookup(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const secret = process.env.HYVOR_ACCEPTED_WEBHOOK_SECRET
  if (!secret) {
    console.error('[hyvor-accepted] HYVOR_ACCEPTED_WEBHOOK_SECRET is not set — rejecting request')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }
  const signature = request.headers.get('x-signature') ?? ''
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: HyvorAcceptedPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event ?? request.headers.get('x-event')
  if (eventType && eventType !== 'send.recipient.accepted') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { send } = payload.payload
  const headers = send?.headers ?? {}
  const campaignUuid = headerLookup(headers, 'X-Listmonk-Campaign')
  const subscriberUuid = headerLookup(headers, 'X-Listmonk-Subscriber')

  if (!campaignUuid || !subscriberUuid) {
    console.warn(
      `[hyvor-accepted] Missing Listmonk headers. ` +
      `Available headers: ${Object.keys(headers).join(', ')}`
    )
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Resolve which client this send belongs to (by sender domain).
  const supabase = await createServiceRoleClient()
  const domain = extractDomain(send?.from_address ?? '')
  let clientId: string | null = null
  if (domain) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .ilike('sender_domain', domain)
      .limit(1)
      .maybeSingle()
    clientId = client?.id ?? null
  }

  const acceptedAt =
    typeof payload.payload.attempt?.created_at === 'number'
      ? new Date(payload.payload.attempt.created_at * 1000).toISOString()
      : typeof payload.payload.attempt?.created_at === 'string'
        ? payload.payload.attempt.created_at
        : new Date().toISOString()

  const { error } = await supabase
    .from('email_deliveries')
    .upsert(
      {
        client_id: clientId,
        campaign_uuid: campaignUuid,
        subscriber_uuid: subscriberUuid,
        delivered_at: acceptedAt,
        hyvor_send_uuid: send?.uuid,
      },
      { onConflict: 'campaign_uuid,subscriber_uuid' }
    )

  if (error) {
    console.error('[hyvor-accepted] Failed to upsert delivery:', error)
  }

  // Always 200 so Hyvor doesn't retry.
  return NextResponse.json({ ok: true })
}
