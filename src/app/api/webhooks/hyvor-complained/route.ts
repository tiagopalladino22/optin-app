import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Forwards Hyvor send.recipient.complained events to Listmonk's bounce webhook
// as a complaint-type bounce. Routing follows the same sender_domain → client
// pattern as the bounce webhook so each client's complaints land in their own
// Listmonk instance.

interface HyvorComplainedPayload {
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
    complaint?: {
      type?: string
      created_at?: number | string
      raw?: string
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

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const secret = process.env.HYVOR_COMPLAINED_WEBHOOK_SECRET
  if (!secret) {
    console.error('[hyvor-complained] HYVOR_COMPLAINED_WEBHOOK_SECRET is not set — rejecting request')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }
  const signature = request.headers.get('x-signature') ?? ''
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: HyvorComplainedPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event ?? request.headers.get('x-event')
  if (eventType && eventType !== 'send.recipient.complained') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { send, recipient, complaint } = payload.payload
  if (!recipient?.address) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const headers = send?.headers ?? {}
  const campaignUuid = headerLookup(headers, 'X-Listmonk-Campaign')
  const subscriberUuid = headerLookup(headers, 'X-Listmonk-Subscriber')

  const target = await resolveListmonkTarget(send?.from_address ?? '')
  if (!target) {
    console.error('[hyvor-complained] No matching client for sender domain and no default Listmonk env vars set')
    return NextResponse.json({ ok: true })
  }

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

  if (!campaignUuid) {
    console.warn(
      `[hyvor-complained] No X-Listmonk-Campaign header found for ${recipient.address}. ` +
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
        `[hyvor-complained] Listmonk (${target.source}${target.clientName ? `:${target.clientName}` : ''}) returned ${response.status}: ${text}`
      )
    }
  } catch (err) {
    console.error('[hyvor-complained] Failed to forward complaint to Listmonk:', err)
  }

  return NextResponse.json({ ok: true })
}
