import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listmonkFetch } from '@/lib/listmonk'
import { createServiceRoleClient } from '@/lib/supabase-server'

interface SubscriberPayload {
  email: string
  name?: string
  attribs?: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { listId, subscribers } = (await request.json()) as {
    listId: number
    subscribers: SubscriberPayload[]
  }

  if (!listId || !subscribers?.length) {
    return NextResponse.json(
      { error: 'listId and subscribers are required' },
      { status: 400 }
    )
  }

  // Verify the client owns this list (unless admin)
  if (session.role !== 'admin' && session.clientId) {
    const supabase = await createServiceRoleClient()
    const { data: resource } = await supabase
      .from('client_resources')
      .select('id')
      .eq('client_id', session.clientId)
      .eq('resource_type', 'list')
      .eq('listmonk_id', listId)
      .single()

    if (!resource) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Filter out rows without email
  const validSubscribers = subscribers.filter((s) => s.email)
  const skipped = subscribers.length - validSubscribers.length

  if (validSubscribers.length === 0) {
    return NextResponse.json({ imported: 0, skipped, errors: ['No valid email addresses found'] })
  }

  // Build CSV for Listmonk's bulk import endpoint
  // Listmonk expects: email, name, attributes (JSON)
  const csvLines = ['email,name,attributes']
  for (const sub of validSubscribers) {
    const email = escapeCsvField(sub.email)
    const name = escapeCsvField(sub.name || '')
    const attribs = escapeCsvField(JSON.stringify(sub.attribs || {}))
    csvLines.push(`${email},${name},${attribs}`)
  }
  const csvData = csvLines.join('\n')

  try {
    // Use Listmonk's bulk import endpoint
    const formData = new FormData()
    formData.append('params', JSON.stringify({
      mode: 'subscribe',
      delim: ',',
      lists: [listId],
      overwrite: true,
    }))
    formData.append('file', new Blob([csvData], { type: 'text/csv' }), 'import.csv')

    const res = await listmonkFetch('import/subscribers', {
      method: 'POST',
      body: formData,
      headers: {}, // Let fetch set the multipart Content-Type
    })

    if (!res.ok) {
      const errData = await res.json()
      return NextResponse.json(
        { error: errData.message || 'Import failed', imported: 0, skipped },
        { status: res.status }
      )
    }

    // Listmonk processes the import asynchronously — poll for status
    const result = await pollImportStatus()

    return NextResponse.json({
      imported: result.imported ?? validSubscribers.length,
      skipped: skipped + (result.skipped ?? 0),
      errors: result.errors,
    })
  } catch (err) {
    console.error('Bulk import failed:', err)
    return NextResponse.json(
      { error: 'Import failed', imported: 0, skipped },
      { status: 500 }
    )
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

async function pollImportStatus(): Promise<{
  imported?: number
  skipped?: number
  errors?: string[]
}> {
  // Phase 1: Wait for import to start
  let started = false
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await listmonkFetch('import/subscribers')
      if (!res.ok) continue
      const data = await res.json()
      const status = data.data
      if (status?.status === 'importing') {
        started = true
        break
      }
      if (status?.status === 'finished') {
        return {
          imported: status.imported ?? undefined,
          skipped: status.skipped ?? undefined,
        }
      }
    } catch {
      // Retry
    }
  }

  if (!started) {
    await new Promise((r) => setTimeout(r, 2000))
    return { imported: undefined, skipped: undefined }
  }

  // Phase 2: Wait for import to finish
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const res = await listmonkFetch('import/subscribers')
      if (!res.ok) continue
      const data = await res.json()
      const status = data.data
      if (!status || status.status === 'none' || status.status === 'finished') {
        return {
          imported: status?.imported ?? undefined,
          skipped: status?.skipped ?? undefined,
        }
      }
      if (status.status === 'failed') {
        return {
          imported: 0,
          skipped: 0,
          errors: [status.log_file || 'Import failed on Listmonk side'],
        }
      }
    } catch {
      // Retry
    }
  }

  return { imported: undefined, skipped: undefined }
}
