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
    const { list_id, list_name, publication_code, import_date, imported_count } = body

    if (!list_id || !list_name || imported_count === undefined || imported_count === null) {
      return NextResponse.json({ error: 'list_id, list_name, and imported_count are required' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from('import_tracking')
      .insert({
        client_id: session.clientId || null,
        list_id,
        list_name,
        publication_code: publication_code || null,
        import_date: import_date || new Date().toISOString().split('T')[0],
        imported_count,
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
