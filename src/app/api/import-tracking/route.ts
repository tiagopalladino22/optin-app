import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceRoleClient()

    let query = supabase
      .from('import_tracking')
      .select('*')
      .order('import_date', { ascending: false })

    if (session.clientId) {
      query = query.eq('client_id', session.clientId)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { list_id, list_name, publication_code, import_date, imported_count, group_id, client_id: bodyClientId } = body

    if (!list_id || !list_name || imported_count === undefined || imported_count === null) {
      return NextResponse.json({ error: 'list_id, list_name, and imported_count are required' }, { status: 400 })
    }

    // Admin can tag a record with any client_id (set via global instance selector).
    // Client users always tag with their own clientId.
    const recordClientId = session.role === 'admin'
      ? (bodyClientId || null)
      : (session.clientId || null)

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from('import_tracking')
      .insert({
        client_id: recordClientId,
        list_id,
        list_name,
        publication_code: publication_code || null,
        import_date: import_date || new Date().toISOString().split('T')[0],
        imported_count,
        group_id: group_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Import tracking insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Import tracking POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const body = await req.json()
    const updates: Record<string, string | null> = {}
    if ('publication_code' in body) {
      const code = typeof body.publication_code === 'string' ? body.publication_code.trim().toUpperCase() : null
      updates.publication_code = code || null
    }
    if ('group_id' in body) {
      updates.group_id = typeof body.group_id === 'string' && body.group_id ? body.group_id : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    let query = supabase.from('import_tracking').update(updates).eq('id', id)
    if (session.clientId) {
      query = query.eq('client_id', session.clientId)
    }

    const { data, error } = await query.select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const supabase = await createServiceRoleClient()

    const { error } = await supabase
      .from('import_tracking')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
