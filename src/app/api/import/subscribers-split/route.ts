import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listmonkFetch } from '@/lib/listmonk'

interface SubscriberPayload {
  email: string
  name?: string
  attribs?: Record<string, unknown>
}

interface SplitConfig {
  name: string
  count: number
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { subscribers, splits } = (await request.json()) as {
    subscribers: SubscriberPayload[]
    splits: SplitConfig[]
  }

  if (!subscribers?.length || !splits?.length) {
    return NextResponse.json(
      { error: 'subscribers and splits are required' },
      { status: 400 }
    )
  }

  // Filter to valid emails
  const validSubscribers = subscribers.filter((s) => s.email)

  if (validSubscribers.length === 0) {
    return NextResponse.json({ error: 'No valid email addresses found' }, { status: 400 })
  }

  const results: { name: string; count: number }[] = []
  const errors: string[] = []

  let offset = 0

  for (const split of splits) {
    if (!split.name.trim() || split.count <= 0) continue

    const chunk = validSubscribers.slice(offset, offset + split.count)
    offset += split.count

    if (chunk.length === 0) {
      errors.push(`"${split.name}": no subscribers in range`)
      continue
    }

    try {
      // 1. Create the list in Listmonk
      const createRes = await listmonkFetch('lists', {
        method: 'POST',
        body: JSON.stringify({
          name: split.name.trim(),
          type: 'private',
          optin: 'single',
          tags: [],
        }),
      })

      if (!createRes.ok) {
        const errData = await createRes.json()
        errors.push(`"${split.name}": Failed to create list — ${errData.message || 'Unknown error'}`)
        continue
      }

      const listData = await createRes.json()
      const newListId = listData.data?.id

      if (!newListId) {
        errors.push(`"${split.name}": List created but no ID returned`)
        continue
      }

      // 2. Build CSV for bulk import
      const csvLines = ['email,name,attributes']
      for (const sub of chunk) {
        const email = escapeCsvField(sub.email)
        const name = escapeCsvField(sub.name || '')
        const attribs = escapeCsvField(JSON.stringify(sub.attribs || {}))
        csvLines.push(`${email},${name},${attribs}`)
      }
      const csvData = csvLines.join('\n')

      // 3. Import subscribers to the new list
      const formData = new FormData()
      formData.append('params', JSON.stringify({
        mode: 'subscribe',
        delim: ',',
        lists: [newListId],
        overwrite: true,
      }))
      formData.append('file', new Blob([csvData], { type: 'text/csv' }), 'import.csv')

      const importRes = await listmonkFetch('import/subscribers', {
        method: 'POST',
        body: formData,
        headers: {},
      })

      if (!importRes.ok) {
        const errData = await importRes.json()
        errors.push(`"${split.name}": Import failed — ${errData.message || 'Unknown error'}`)
        continue
      }

      // 4. Wait for import to finish before starting next one
      await waitForImport()

      results.push({ name: split.name, count: chunk.length })
    } catch (err) {
      errors.push(`"${split.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const totalImported = results.reduce((sum, r) => sum + r.count, 0)

  return NextResponse.json({
    imported: totalImported,
    skipped: validSubscribers.length - totalImported,
    lists: results,
    errors: errors.length > 0 ? errors : undefined,
  })
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

async function waitForImport(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000))

    try {
      const res = await listmonkFetch('import/subscribers')
      if (!res.ok) continue

      const data = await res.json()
      const status = data.data?.status

      if (!status || status === 'none' || status === 'finished') {
        return
      }

      if (status === 'failed') {
        return
      }
    } catch {
      // Retry
    }
  }
}
