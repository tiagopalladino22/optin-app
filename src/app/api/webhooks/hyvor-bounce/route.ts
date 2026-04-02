import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// Translates Hyvor Relay bounce webhooks to Listmonk's /webhooks/bounce format.
// This endpoint is intentionally public (no user auth) — called directly by Hyvor.

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

  // Forward to Listmonk
  const listmonkUrl = process.env.LISTMONK_URL
  const listmonkUsername = process.env.LISTMONK_USERNAME
  const listmonkPassword = process.env.LISTMONK_PASSWORD

  if (!listmonkUrl || !listmonkUsername || !listmonkPassword) {
    console.error('[hyvor-bounce] Missing Listmonk env vars (LISTMONK_URL, LISTMONK_USERNAME, LISTMONK_PASSWORD)')
    return NextResponse.json({ ok: true })
  }

  // Note: Listmonk does not include campaign UUID in SMTP headers,
  // so bounces are recorded without campaign association.
  const listmonkBody = {
    email,
    source: 'api',
    type: bounceType,
    meta: JSON.stringify({
      smtp_code: smtpCode,
      smtp_message: smtpMessage,
      hyvor_send_uuid: send?.uuid,
    }),
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
