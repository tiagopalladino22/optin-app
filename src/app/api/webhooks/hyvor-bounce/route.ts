import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// Translates Hyvor Relay bounce webhooks to Listmonk's /webhooks/bounce format.
// This endpoint is intentionally public (no user auth) — called directly by Hyvor.

interface HyvorBouncePayload {
  event?: string
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
  attempt: unknown | null
  bounce: {
    status: string // SMTP status code, e.g. "550"
    text: string
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

function getBounceType(smtpStatus: string): 'hard' | 'soft' {
  return smtpStatus.startsWith('5') ? 'hard' : 'soft'
}

// Listmonk includes the campaign UUID in email headers when sending via SMTP.
// The exact header name depends on the Listmonk version — adjust if needed after
// inspecting a real Hyvor webhook payload in your logs.
function extractCampaignUuid(headers: Record<string, string>): string | null {
  const candidates = [
    headers['X-Campaign-UUID'],
    headers['x-campaign-uuid'],
    headers['X-Listmonk-Campaign'],
    headers['x-listmonk-campaign'],
  ]
  return candidates.find(Boolean) ?? null
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

  // If no event field, fall back to checking that bounce data is present
  if (!payload.bounce || !payload.recipient?.address) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const email = payload.recipient.address
  const bounceType = getBounceType(payload.bounce.status)
  const campaignUuid = extractCampaignUuid(payload.send?.headers ?? {})

  if (!campaignUuid) {
    // Log to help debug the header name in your specific Listmonk version
    console.warn(
      '[hyvor-bounce] Could not extract campaign_uuid from send headers.',
      'Available headers:', Object.keys(payload.send?.headers ?? {}),
      '— bounce will be recorded without campaign association.'
    )
  }

  // Forward to Listmonk
  const listmonkUrl = process.env.LISTMONK_URL
  const listmonkUsername = process.env.LISTMONK_USERNAME
  const listmonkPassword = process.env.LISTMONK_PASSWORD

  if (!listmonkUrl || !listmonkUsername || !listmonkPassword) {
    console.error('[hyvor-bounce] Missing Listmonk env vars (LISTMONK_URL, LISTMONK_USERNAME, LISTMONK_PASSWORD)')
    return NextResponse.json({ ok: true })
  }

  const listmonkBody: Record<string, string> = {
    email,
    source: 'api',
    type: bounceType,
    meta: JSON.stringify({
      smtp_status: payload.bounce.status,
      bounce_text: payload.bounce.text,
      hyvor_send_uuid: payload.send?.uuid,
    }),
  }

  if (campaignUuid) {
    listmonkBody.campaign_uuid = campaignUuid
  }

  try {
    const credentials = Buffer.from(`${listmonkUsername}:${listmonkPassword}`).toString('base64')
    const response = await fetch(`${listmonkUrl}/webhooks/bounce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(listmonkBody),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[hyvor-bounce] Listmonk returned ${response.status}: ${text}`)
    }
  } catch (err) {
    console.error('[hyvor-bounce] Failed to forward bounce to Listmonk:', err)
  }

  // Always return 200 to Hyvor to prevent unnecessary retries
  return NextResponse.json({ ok: true })
}
