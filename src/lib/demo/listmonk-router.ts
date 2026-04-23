import { NextResponse } from 'next/server'
import { DEMO_LISTS, getDemoListById } from './fixtures/lists'
import { DEMO_CAMPAIGNS, getDemoCampaignById } from './fixtures/campaigns'
import { DEMO_TEMPLATES } from './fixtures/templates'

function paginated<T>(items: T[], query: URLSearchParams) {
  const page = parseInt(query.get('page') || '1', 10) || 1
  const perPage = parseInt(query.get('per_page') || '20', 10) || 20
  const start = (page - 1) * perPage
  const slice = items.slice(start, start + perPage)
  return {
    data: {
      results: slice,
      total: items.length,
      per_page: perPage,
      page,
    },
  }
}

function previewHtml(campaignName: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${campaignName}</title></head><body style="font-family:Inter,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1a1a1a;">${body}</body></html>`
}

export function tryDemoListmonkResponse(
  pathStr: string,
  method: string,
  query: URLSearchParams,
): NextResponse | null {
  if (method !== 'GET') {
    return NextResponse.json({ data: { ok: true } })
  }

  // Lists
  if (pathStr === 'lists') {
    return NextResponse.json(paginated(DEMO_LISTS, query))
  }
  const listMatch = pathStr.match(/^lists\/(\d+)$/)
  if (listMatch) {
    const list = getDemoListById(parseInt(listMatch[1], 10))
    if (!list) return NextResponse.json({ data: null }, { status: 404 })
    return NextResponse.json({ data: list })
  }

  // Templates
  if (pathStr === 'templates') {
    return NextResponse.json({ data: DEMO_TEMPLATES })
  }
  const templateMatch = pathStr.match(/^templates\/(\d+)$/)
  if (templateMatch) {
    const tpl = DEMO_TEMPLATES.find((t) => t.id === parseInt(templateMatch[1], 10))
    return NextResponse.json({ data: tpl ?? null }, { status: tpl ? 200 : 404 })
  }

  // Campaign analytics — link clicks
  if (pathStr === 'campaigns/analytics/links') {
    const id = parseInt(query.get('id') || '0', 10)
    const campaign = getDemoCampaignById(id)
    if (!campaign || campaign.clicks === 0) {
      return NextResponse.json({ data: [] })
    }
    const links = [
      { url: 'https://tryoptin.com/blog/sample-post-1', count: Math.round(campaign.clicks * 0.42) },
      { url: 'https://tryoptin.com/blog/sample-post-2', count: Math.round(campaign.clicks * 0.28) },
      { url: 'https://tryoptin.com/pricing', count: Math.round(campaign.clicks * 0.18) },
      { url: 'https://tryoptin.com/case-studies', count: Math.round(campaign.clicks * 0.08) },
      { url: 'https://twitter.com/tryoptin', count: Math.round(campaign.clicks * 0.04) },
    ]
    return NextResponse.json({ data: links })
  }

  // Campaign list
  if (pathStr === 'campaigns') {
    return NextResponse.json(paginated(DEMO_CAMPAIGNS, query))
  }

  // Campaign preview (HTML, not JSON)
  const previewMatch = pathStr.match(/^campaigns\/(\d+)\/preview$/)
  if (previewMatch) {
    const campaign = getDemoCampaignById(parseInt(previewMatch[1], 10))
    const html = campaign
      ? previewHtml(campaign.name, campaign.body || '<p>(empty)</p>')
      : '<html><body>Not found</body></html>'
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Campaign detail
  const campaignMatch = pathStr.match(/^campaigns\/(\d+)$/)
  if (campaignMatch) {
    const campaign = getDemoCampaignById(parseInt(campaignMatch[1], 10))
    if (!campaign) return NextResponse.json({ data: null }, { status: 404 })
    return NextResponse.json({ data: campaign })
  }

  // Subscribers stub — nothing in scope reads this for the demo, but return safe default
  if (pathStr.startsWith('subscribers')) {
    return NextResponse.json({ data: { results: [], total: 0, per_page: 0, page: 1 } })
  }

  // Anything else — return empty paginated shape so callers don't crash
  return NextResponse.json({ data: { results: [], total: 0, per_page: 0, page: 1 } })
}
