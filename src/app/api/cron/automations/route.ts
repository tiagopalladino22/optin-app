import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { executeAutomation, isDue, type SegmentRule } from '@/lib/automation-engine'

// GET /api/cron/automations — triggered by Vercel Cron every hour
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const now = new Date()
  const results: { id: string; name: string; status: string; error?: string }[] = []

  // Fetch all active automations
  const { data: automations, error } = await supabase
    .from('automations')
    .select('*, publications(code, name)')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!automations || automations.length === 0) {
    return NextResponse.json({ message: 'No active automations', results: [] })
  }

  for (const automation of automations) {
    const automationRecord = {
      id: automation.id as string,
      name: automation.name as string,
      publication_id: automation.publication_id as string | null,
      rules: automation.rules as SegmentRule[],
      logic: automation.logic as 'and' | 'or',
      actions: automation.actions as string[],
      cohort_weeks: automation.cohort_weeks as number | null,
      schedule_day: automation.schedule_day as number,
      schedule_hour: automation.schedule_hour as number,
      schedule_timezone: automation.schedule_timezone as string,
    }

    if (!isDue(automationRecord, now)) {
      continue
    }

    // Check if already ran this hour
    const hourStart = new Date(now)
    hourStart.setMinutes(0, 0, 0)

    const { data: recentRuns } = await supabase
      .from('automation_runs')
      .select('id')
      .eq('automation_id', automation.id)
      .gte('run_at', hourStart.toISOString())
      .limit(1)

    if (recentRuns && recentRuns.length > 0) {
      continue // Already ran this hour
    }

    // Create run record
    const { data: run } = await supabase
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        status: 'running',
        run_at: now.toISOString(),
      })
      .select()
      .single()

    if (!run) {
      results.push({ id: automation.id, name: automation.name, status: 'failed', error: 'Could not create run record' })
      continue
    }

    try {
      const pubCode = (automation.publications as { code: string } | null)?.code || ''

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outcome = await executeAutomation(automationRecord, supabase as any, pubCode)

      await supabase
        .from('automation_runs')
        .update({
          status: 'completed',
          action_taken: automationRecord.actions.join(', '),
          subscribers_processed: outcome.processed,
          subscribers_deleted: outcome.deleted,
          subscribers_kept: outcome.kept,
        })
        .eq('id', run.id)

      results.push({ id: automation.id, name: automation.name, status: 'completed' })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'

      await supabase
        .from('automation_runs')
        .update({
          status: 'failed',
          details: { error: errorMessage },
        })
        .eq('id', run.id)

      results.push({ id: automation.id, name: automation.name, status: 'failed', error: errorMessage })
    }
  }

  return NextResponse.json({
    message: `Processed ${results.length} automation(s)`,
    results,
  })
}
