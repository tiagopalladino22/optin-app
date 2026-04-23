interface DemoCampaign {
  id: number
  uuid: string
  name: string
  subject: string
  from_email: string
  status: 'draft' | 'running' | 'scheduled' | 'paused' | 'cancelled' | 'finished'
  type: 'regular'
  tags: string[]
  send_at: string | null
  started_at: string | null
  created_at: string
  updated_at: string
  lists: { id: number; name: string }[]
  views: number
  clicks: number
  bounces: number
  sent: number
  to_send: number
  body?: string
  template_id?: number
  content_type?: string
  messenger?: string
}

const FROM = 'Demo Newsletter <hello@tryoptin.com>'

function dayAgo(n: number): string {
  const d = new Date('2026-04-23T14:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString()
}

function build(
  id: number,
  name: string,
  subject: string,
  daysAgo: number,
  listIds: number[],
  sent: number,
  openRate: number,
  ctr: number,
  status: DemoCampaign['status'] = 'finished',
): DemoCampaign {
  const views = Math.round(sent * openRate)
  const clicks = Math.round(views * ctr)
  const bounces = Math.round(sent * 0.012)
  const date = dayAgo(daysAgo)
  const listNames: Record<number, string> = {
    1: 'Demo Newsletter — Main',
    2: 'Demo Newsletter — Premium',
    3: 'Demo Newsletter — Tuesday',
    4: 'Demo Newsletter — Friday',
    5: 'Founders Digest — Main',
    6: 'Founders Digest — VIP',
    7: 'Marketing Weekly',
    8: 'Product Insider',
    9: 'AI Briefing — Daily',
    10: 'AI Briefing — Weekly Recap',
    11: 'Growth Loop — General',
    12: 'Growth Loop — Founders Only',
  }
  return {
    id,
    uuid: `demo-camp-${String(id).padStart(4, '0')}`,
    name,
    subject,
    from_email: FROM,
    status,
    type: 'regular',
    tags: [],
    send_at: null,
    started_at: status === 'finished' || status === 'running' ? date : null,
    created_at: date,
    updated_at: date,
    lists: listIds.map((lid) => ({ id: lid, name: listNames[lid] || `List ${lid}` })),
    views,
    clicks,
    bounces,
    sent,
    to_send: sent,
    body: '<h1>Demo Campaign</h1><p>This is sample content shown in the OPTIN demo. Sign up to send real campaigns to your audience.</p><p><a href="https://tryoptin.com">Visit OPTIN</a> to get started.</p>',
    template_id: 1,
    content_type: 'html',
    messenger: 'email',
  }
}

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  build(101, 'Demo Newsletter — Issue #14 — 4/22/2026 (Tuesday)', 'The 5 marketing levers nobody is using right now', 1,  [1, 3], 24800, 0.428, 0.067),
  build(102, 'Demo Newsletter — Issue #13 — 4/18/2026 (Friday)',  'Why your funnel is leaking (and the fix)',           5,  [1, 4], 24512, 0.412, 0.058),
  build(103, 'Demo Newsletter — Issue #12 — 4/15/2026 (Tuesday)', 'A weird CRO experiment that 3x our trial signups',   8,  [1, 3], 24320, 0.451, 0.072),
  build(104, 'Demo Newsletter — Issue #11 — 4/11/2026 (Friday)',  'The 1-line subject line that beat everything',       12, [1, 4], 24050, 0.467, 0.081),
  build(105, 'Demo Newsletter — Issue #10 — 4/8/2026 (Tuesday)',  'How a 3-person team out-shipped a 30-person team',   15, [1, 3], 23890, 0.435, 0.062),
  build(106, 'Demo Newsletter — Issue #9 — 4/4/2026 (Friday)',    'I rebuilt my onboarding in a weekend. Results:',     19, [1, 4], 23612, 0.420, 0.055),
  build(107, 'Demo Newsletter — Issue #8 — 4/1/2026 (Tuesday)',   'The April playbook (steal this)',                    22, [1, 3], 23410, 0.448, 0.070),
  build(108, 'Demo Newsletter — Premium #4',                      'Premium: Q2 strategy session recording',             7,  [2],    4180,  0.612, 0.184),
  build(109, 'Demo Newsletter — Premium #3',                      'Premium: Behind the scenes of our launch',           21, [2],    4090,  0.598, 0.171),

  build(201, 'Founders Digest — Issue #22 — 4/22/2026 (Tuesday)', '7 questions every founder should ask weekly',        1,  [5], 18100, 0.402, 0.061),
  build(202, 'Founders Digest — Issue #21 — 4/15/2026 (Tuesday)', 'How I made my first $10k MRR',                       8,  [5], 17920, 0.418, 0.067),
  build(203, 'Founders Digest — Issue #20 — 4/8/2026 (Tuesday)',  'The hire that changed everything',                   15, [5], 17730, 0.395, 0.054),
  build(204, 'Founders Digest — VIP — March recap',               'VIP: My March numbers + what I learned',             25, [6], 1932,  0.654, 0.213),

  build(301, 'Marketing Weekly — #18',                            '5 ad creatives crushing it on Meta this week',       2,  [7], 12200, 0.371, 0.052),
  build(302, 'Marketing Weekly — #17',                            'The new SEO playbook nobody is talking about',       9,  [7], 12110, 0.388, 0.061),
  build(303, 'Marketing Weekly — #16',                            'Cold email frameworks that still work in 2026',      16, [7], 12010, 0.402, 0.067),

  build(401, 'Product Insider — #11',                             'A surprisingly simple onboarding pattern',           3,  [8], 9810, 0.432, 0.084),
  build(402, 'Product Insider — #10',                             'Why most product roadmaps fail',                     10, [8], 9750, 0.418, 0.071),
  build(403, 'Product Insider — #9',                              'PLG is back. Here is the new motion.',               17, [8], 9680, 0.401, 0.063),

  build(501, 'AI Briefing — Daily 4/22',                          'Anthropic ships, OpenAI responds, Google bench',     1,  [9],  31100, 0.318, 0.041),
  build(502, 'AI Briefing — Daily 4/21',                          'Self-hosted Llama 4 is faster than I expected',      2,  [9],  30950, 0.332, 0.048),
  build(503, 'AI Briefing — Daily 4/20',                          'The agent eval problem nobody wants to talk about',  3,  [9],  30810, 0.341, 0.052),
  build(504, 'AI Briefing — Weekly Recap #14',                    'The 4 stories that mattered this week in AI',        4,  [10], 14400, 0.412, 0.083),

  build(601, 'Growth Loop — Founders #5',                         'Founders only: my Q2 retention experiment',          6,  [12], 1278,  0.621, 0.187),
  build(602, 'Growth Loop — General #18',                         'The retention loop that fixed our churn',            6,  [11], 6650,  0.392, 0.058),

  build(701, 'Demo Newsletter — Draft for review',                'Draft: working title TBD',                           0,  [1],  0,     0,     0,     'draft'),
]

export function getDemoCampaignById(id: number): DemoCampaign | undefined {
  return DEMO_CAMPAIGNS.find((c) => c.id === id)
}
