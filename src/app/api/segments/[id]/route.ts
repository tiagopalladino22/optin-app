import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { isDemoMode } from '@/lib/demo/config'
import { getDemoSegmentById } from '@/lib/demo/fixtures/segments'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isDemoMode()) {
    const seg = getDemoSegmentById(params.id)
    return NextResponse.json({ data: seg ?? null }, { status: seg ? 200 : 404 })
  }

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ data })
}
