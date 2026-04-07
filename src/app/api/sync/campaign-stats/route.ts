import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch } from '@/lib/listmonk'
import { parseCampaignName, getIssueGroupKey, type PublicationMapping } from '@/lib/campaign-parser'
import { pushToGrowth } from '@/lib/webhook-client'

interface CampaignData {
  id: number
  name: string
  sent: number
  views: number
  clicks: number
  bounces: number
  started_at: string | null
  created_at: string
  lists: { id: number; name: string }[]
}

// POST /api/sync/campaign-stats — manually trigger or called from cron
export async function POST(request: NextRequest) {
  // Auth: either admin session or cron secret
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createServiceRoleClient()

  // Optional: filter to a single publication
  let filterCode: string | null = null
  let force = false
  try {
    const text = await request.text()
    if (text) {
      const body = JSON.parse(text)
      if (body?.publication_code) filterCode = body.publication_code.toUpperCase()
      if (body?.force) force = true
    }
  } catch { /* no body or invalid JSON */ }

  // Get all publications with growth_client_id mapped
  let pubQuery = supabase
    .from('publications')
    .select('code, name, growth_client_id, sync_grouping, sync_send_days, sync_enabled, sync_match_by')
    .not('growth_client_id', 'is', null)

  if (filterCode) pubQuery = pubQuery.eq('code', filterCode)

  const { data: publications } = await pubQuery

  if (!publications || publications.length === 0) {
    return NextResponse.json({ message: 'No publications mapped to 150growth', synced: 0 })
  }

  // Build publication mappings for the parser
  // Each pub tells the parser what string to look for in campaign names
  const pubMappings: PublicationMapping[] = []
  for (const p of publications) {
    // Always add code as a match option
    pubMappings.push({ code: p.code, name: p.code })
    // If match_by is 'name', also add the full name as a match option
    if (p.sync_match_by === 'name' && p.name && p.name !== p.code) {
      pubMappings.push({ code: p.code, name: p.name })
    }
  }

  const pubMap = new Map<string, { growthClientId: string; grouping: string }>()
  for (const pub of publications) {
    if (pub.growth_client_id) {
      pubMap.set(pub.code.toUpperCase(), {
        growthClientId: pub.growth_client_id,
        grouping: pub.sync_grouping || 'issue_number',
      })
    }
  }

  // Fetch finished campaigns from last 48 hours
  const campaigns = await fetchRecentCampaigns()

  // Parse and group by issue using each pub's grouping setting
  const issueGroups = new Map<string, {
    parsed: ReturnType<typeof parseCampaignName>
    campaigns: CampaignData[]
    growthClientId: string
  }>()

  for (const campaign of campaigns) {
    const parsed = parseCampaignName(campaign.name, pubMappings)
    if (!parsed) continue

    const pubConfig = pubMap.get(parsed.publicationCode)
    if (!pubConfig) continue

    const { growthClientId, grouping } = pubConfig

    // Build group key based on the publication's grouping setting
    let key: string
    if (grouping === 'day') {
      key = `${parsed.publicationCode}:${parsed.sendDate}`
    } else if (grouping === 'week') {
      // Group by ISO week: get Monday of the send date's week
      const d = new Date(parsed.sendDate)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff))
      key = `${parsed.publicationCode}:w${monday.toISOString().slice(0, 10)}`
    } else {
      // Default: group by issue number (or fall back to date)
      key = getIssueGroupKey(parsed)
    }
    if (!issueGroups.has(key)) {
      issueGroups.set(key, { parsed, campaigns: [], growthClientId: growthClientId })
    }
    issueGroups.get(key)!.campaigns.push(campaign)
  }

  // Check which issues were already synced
  const alreadySynced = new Set<string>()
  if (issueGroups.size > 0) {
    const { data: logs } = await supabase
      .from('webhook_sync_log')
      .select('publication_code, payload')
      .eq('sync_type', 'campaign_stats')
      .eq('status', 'success')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (logs) {
      for (const log of logs) {
        const p = log.payload as Record<string, unknown>
        const d = p?.data as Record<string, unknown>
        if (d?.issue_name && d?.send_date) {
          alreadySynced.add(`${d.issue_name}:${d.send_date}`)
        }
      }
    }
  }

  const results: { issue: string; status: string }[] = []

  for (const [, group] of Array.from(issueGroups.entries())) {
    const { parsed, campaigns: groupCampaigns, growthClientId } = group
    if (!parsed) continue

    // Use earliest send date in the group for the kpi_entry
    const allParsed = groupCampaigns
      .map((c) => parseCampaignName(c.name))
      .filter(Boolean) as NonNullable<ReturnType<typeof parseCampaignName>>[]
    const earliestDate = allParsed.length > 0
      ? allParsed.reduce((earliest, p) => p.sendDate < earliest ? p.sendDate : earliest, allParsed[0].sendDate)
      : parsed.sendDate

    const syncKey = `${parsed.issueName}:${earliestDate}`
    if (!force && alreadySynced.has(syncKey)) {
      results.push({ issue: parsed.issueName, status: 'already synced' })
      continue
    }

    try {
      // Fetch unique stats for each campaign in the group
      let totalSent = 0
      let totalOpens = 0
      let totalClicks = 0
      let totalUnsubs = 0
      let totalBounces = 0
      const subSends: {
        list_name: string
        recipients: number
        opens: number
        clicks: number
        unsubs: number
        bounces: number
        spam_reports: number
        sort_order: number
      }[] = []

      for (const campaign of groupCampaigns) {
        const [uniqueOpens, uniqueClicks] = await Promise.all([
          getUniqueCount('campaign_views', campaign.id),
          getUniqueCount('link_clicks', campaign.id),
        ])

        // Estimate unsubs for this campaign
        const unsubs = await getUnsubCount(
          campaign.lists.map((l) => l.id),
          campaign.started_at || campaign.created_at,
          new Date().toISOString()
        )

        totalSent += campaign.sent
        totalOpens += uniqueOpens
        totalClicks += uniqueClicks
        totalUnsubs += unsubs
        totalBounces += campaign.bounces

        // Add per-list breakdown
        for (const list of campaign.lists) {
          subSends.push({
            list_name: list.name,
            recipients: campaign.sent,
            opens: uniqueOpens,
            clicks: uniqueClicks,
            unsubs,
            bounces: campaign.bounces,
            spam_reports: 0,
            sort_order: subSends.length,
          })
        }
      }

      const openRate = totalSent > 0 ? parseFloat(((totalOpens / totalSent) * 100).toFixed(2)) : 0
      const ctr = totalOpens > 0 ? parseFloat(((totalClicks / totalOpens) * 100).toFixed(2)) : 0
      const unsubRate = totalSent > 0 ? parseFloat(((totalUnsubs / totalSent) * 100).toFixed(3)) : 0
      const bounceRate = totalSent > 0 ? parseFloat(((totalBounces / totalSent) * 100).toFixed(2)) : 0

      const result = await pushToGrowth({
        type: 'campaign_stats',
        client_id: growthClientId,
        data: {
          issue_name: parsed.issueName,
          issue_number: parsed.issueNumber,
          send_date: earliestDate,
          recipients: totalSent,
          opens: totalOpens,
          clicks: totalClicks,
          unsubs: totalUnsubs,
          bounces: totalBounces,
          spam_reports: 0,
          open_rate: openRate,
          ctr,
          unsub_rate: unsubRate,
          spam_rate: 0,
          bounce_rate: bounceRate,
          sub_sends: subSends,
        },
      }, parsed.publicationCode)

      results.push({
        issue: parsed.issueName,
        status: result.ok ? 'synced' : `failed: ${result.body.slice(0, 100)}`,
      })
    } catch (err) {
      results.push({
        issue: parsed.issueName,
        status: `error: ${err instanceof Error ? err.message : 'Unknown'}`,
      })
    }
  }

  return NextResponse.json({
    message: `Processed ${results.length} issue(s)`,
    results,
  })
}

async function fetchRecentCampaigns(): Promise<CampaignData[]> {
  const campaigns: CampaignData[] = []
  let page = 1

  while (true) {
    const res = await listmonkFetch(`campaigns?status=finished&per_page=50&page=${page}`)
    if (!res.ok) break

    const data = await res.json()
    const results = data.data?.results || []

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    let foundOld = false

    for (const c of results) {
      const sentDate = new Date(c.started_at || c.created_at)
      if (sentDate < cutoff) {
        foundOld = true
        continue
      }
      campaigns.push({
        id: c.id,
        name: c.name,
        sent: c.sent || 0,
        views: c.views || 0,
        clicks: c.clicks || 0,
        bounces: c.bounces || 0,
        started_at: c.started_at,
        created_at: c.created_at,
        lists: c.lists || [],
      })
    }

    if (foundOld || results.length < 50) break
    page++
  }

  return campaigns
}

async function getUniqueCount(table: string, campaignId: number): Promise<number> {
  try {
    const query = `subscribers.id IN (SELECT subscriber_id FROM ${table} WHERE campaign_id=${campaignId})`
    const res = await listmonkFetch(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}

async function getUnsubCount(listIds: number[], from: string, to: string): Promise<number> {
  if (listIds.length === 0 || !from) return 0
  try {
    const listFilter = listIds.length === 1
      ? `list_id = ${listIds[0]}`
      : `list_id IN (${listIds.join(',')})`
    const query = `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE ${listFilter} AND status = 'unsubscribed' AND updated_at >= '${from}' AND updated_at < '${to}')`
    const res = await listmonkFetch(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}
