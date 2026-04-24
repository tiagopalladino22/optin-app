import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Translates Hyvor Relay bounce webhooks to Listmonk's /webhooks/bounce format.
// This endpoint is intentionally public (no user auth) — called directly by Hyvor.
//
// Multi-tenant routing: when the bounce's from_address domain matches a client's
// `sender_domain`, we forward to that client's Listmonk instance using the
// credentials stored on the clients row. Otherwise we fall back to the default
// Listmonk configured via env vars.

function extractDomain(fromAddress: string): string | null {
  // from_address can be `Name <user@domain.com>` or `user@domain.com`.
  const match = fromAddress.match(/<([^>]+)>/) ?? [null, fromAddress.trim()]
  const email = (match[1] ?? '').trim()
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).trim().toLowerCase()
}

async function resolveListmonkTarget(fromAddress: string): Promise<{
  url: string
  username: string
  password: string
  source: 'client' | 'default'
  clientName?: string
} | null> {
  const domain = extractDomain(fromAddress)
  if (domain) {
    const supabase = await createServiceRoleClient()
    const { data: client } = await supabase
      .from('clients')
      .select('name, listmonk_url, listmonk_username, listmonk_password')
      .ilike('sender_domain', domain)
      .limit(1)
      .maybeSingle()
    if (client?.listmonk_url && client?.listmonk_username && client?.listmonk_password) {
      return {
        url: client.listmonk_url,
        username: client.listmonk_username,
        password: client.listmonk_password,
        source: 'client',
        clientName: client.name,
      }
    }
  }

  const url = process.env.LISTMONK_URL
  const username = process.env.LISTMONK_USERNAME
  const password = process.env.LISTMONK_PASSWORD
  if (!url || !username || !password) return null
  return { url, username, password, source: 'default' }
}

interface HyvorBouncePayload {
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
      recipients: Array<{
        smtp_code: number
        smtp_message: string
      }>
    } | null
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false
  }
}

function getBounceType(smtpCode: number): 'hard' | 'soft' {
  return smtpCode >= 500 ? 'hard' : 'soft'
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify HMAC-SHA256 signature — fail closed if secret is not configured
  const hyvorSecret = process.env.HYVOR_WEBHOOK_SECRET
  if (!hyvorSecret) {
    console.error('[hyvor-bounce] HYVOR_WEBHOOK_SECRET is not set — rejecting request')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }
  const signature = request.headers.get('x-signature') ?? ''
  if (!verifySignature(rawBody, signature, hyvorSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: HyvorBouncePayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process bounce events — ignore others silently
  const eventType = payload.event ?? request.headers.get('x-event')
  if (eventType && eventType !== 'send.recipient.bounced') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { send, recipient, attempt } = payload.payload

  if (!recipient?.address) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const email = recipient.address
  const smtpCode = attempt?.recipients?.[0]?.smtp_code ?? 550
  const smtpMessage = attempt?.recipients?.[0]?.smtp_message ?? ''
  const bounceType = getBounceType(smtpCode)

  // Listmonk stamps every outgoing campaign email with these custom headers.
  // Hyvor forwards them in send.headers — extract so the bounce gets linked
  // to the right campaign + subscriber.
  const headers = send?.headers ?? {}
  const headerLookup = (name: string): string | undefined => {
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) return headers[key]
    }
    return undefined
  }
  const campaignUuid = headerLookup('X-Listmonk-Campaign')
  const subscriberUuid = headerLookup('X-Listmonk-Subscriber')

  const target = await resolveListmonkTarget(send?.from_address ?? '')
  if (!target) {
    console.error('[hyvor-bounce] No matching client for sender domain and no default Listmonk env vars set')
    return NextResponse.json({ ok: true })
  }

  const listmonkBody: Record<string, unknown> = {
    email,
    source: 'api',
    type: bounceType,
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
      `[hyvor-bounce] No X-Listmonk-Campaign header found for ${email}. ` +
      `Available headers: ${Object.keys(headers).join(', ')}`
    )
  }

  try {
    const credentials = Buffer.from(`${target.username}:${target.password}`).toString('base64')
    const response = await fetch(`${target.url}/webhooks/bounce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(listmonkBody),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(
        `[hyvor-bounce] Listmonk (${target.source}${target.clientName ? `:${target.clientName}` : ''}) returned ${response.status}: ${text}`
      )
    }
  } catch (err) {
    console.error('[hyvor-bounce] Failed to forward bounce to Listmonk:', err)
  }

  // Always return 200 to Hyvor to prevent unnecessary retries
  return NextResponse.json({ ok: true })
}
