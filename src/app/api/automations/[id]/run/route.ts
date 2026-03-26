import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { executeAutomation } from '@/lib/automation-engine'

// POST manually trigger an automation run (admin only)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await params

  const supabase = await createServiceRoleClient()

  // Fetch the automation
  const { data: automation, error: automationError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', id)
    .single()

  if (automationError) {
    return NextResponse.json({ error: automationError.message }, { status: 500 })
  }

  if (!automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  // Fetch publication code if publication_id is set
  let publicationCode: string | null = null
  if (automation.publication_id) {
    const { data: pub } = await supabase
      .from('publications')
      .select('code')
      .eq('id', automation.publication_id)
      .single()
    publicationCode = pub?.code || null
  }

  // Create a run record with status 'running'
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      automation_id: id,
      status: 'running',
      run_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  try {
    // Execute the automation
    const result = await executeAutomation(
      automation,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      publicationCode || undefined
    )

    // Update run with success
    const details: Record<string, unknown> = {}
    if (result.csvData) {
      details.csv = result.csvData
    }

    const { data: updatedRun, error: updateError } = await supabase
      .from('automation_runs')
      .update({
        status: 'completed',
        action_taken: automation.actions.join(', '),
        subscribers_processed: result.processed,
        subscribers_deleted: result.deleted,
        subscribers_kept: result.kept,
        details: Object.keys(details).length > 0 ? details : null,
      })
      .eq('id', run.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updatedRun })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'

    // Update run with failure
    const { data: failedRun, error: updateError } = await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        details: { error: errorMessage },
      })
      .eq('id', run.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: failedRun }, { status: 500 })
  }
}
