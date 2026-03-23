import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (!clientId) {
    return NextResponse.json(
      { error: 'client_id is required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('client_resources')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { clientId, resourceType, listmonkId, label } = body

  if (!clientId || !resourceType || !listmonkId) {
    return NextResponse.json(
      { error: 'clientId, resourceType, and listmonkId are required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('client_resources')
    .insert({
      client_id: clientId,
      resource_type: resourceType,
      listmonk_id: listmonkId,
      label: label || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { clientId, resourceType, listmonkId } = body

  if (!clientId || !resourceType || !listmonkId) {
    return NextResponse.json(
      { error: 'clientId, resourceType, and listmonkId are required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()
  const { error } = await supabase
    .from('client_resources')
    .delete()
    .eq('client_id', clientId)
    .eq('resource_type', resourceType)
    .eq('listmonk_id', listmonkId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
