interface DemoList {
  id: number
  uuid: string
  name: string
  type: 'public' | 'private'
  optin: 'single' | 'double'
  tags: string[]
  subscriber_count: number
  created_at: string
  updated_at: string
}

const baseDate = '2024-09-15T10:00:00Z'

export const DEMO_LISTS: DemoList[] = [
  { id: 1,  uuid: 'demo-list-001', name: 'Demo Newsletter — Main',          type: 'private', optin: 'double', tags: ['DEMO'], subscriber_count: 24812, created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 2,  uuid: 'demo-list-002', name: 'Demo Newsletter — Premium',       type: 'private', optin: 'double', tags: ['DEMO'], subscriber_count: 4218,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 3,  uuid: 'demo-list-003', name: 'Demo Newsletter — Tuesday',       type: 'private', optin: 'double', tags: ['DEMO'], subscriber_count: 8120,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 4,  uuid: 'demo-list-004', name: 'Demo Newsletter — Friday',        type: 'private', optin: 'double', tags: ['DEMO'], subscriber_count: 7984,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 5,  uuid: 'demo-list-005', name: 'Founders Digest — Main',          type: 'private', optin: 'double', tags: ['FND'],  subscriber_count: 18203, created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 6,  uuid: 'demo-list-006', name: 'Founders Digest — VIP',           type: 'private', optin: 'double', tags: ['FND'],  subscriber_count: 1942,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 7,  uuid: 'demo-list-007', name: 'Marketing Weekly',                type: 'private', optin: 'double', tags: ['MKT'],  subscriber_count: 12305, created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 8,  uuid: 'demo-list-008', name: 'Product Insider',                 type: 'private', optin: 'double', tags: ['PRD'],  subscriber_count: 9871,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 9,  uuid: 'demo-list-009', name: 'AI Briefing — Daily',             type: 'private', optin: 'double', tags: ['AIB'],  subscriber_count: 31204, created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 10, uuid: 'demo-list-010', name: 'AI Briefing — Weekly Recap',      type: 'private', optin: 'double', tags: ['AIB'],  subscriber_count: 14523, created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 11, uuid: 'demo-list-011', name: 'Growth Loop — General',           type: 'private', optin: 'double', tags: ['GRO'],  subscriber_count: 6712,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
  { id: 12, uuid: 'demo-list-012', name: 'Growth Loop — Founders Only',     type: 'private', optin: 'double', tags: ['GRO'],  subscriber_count: 1287,  created_at: baseDate, updated_at: '2026-04-20T12:00:00Z' },
]

export function getDemoListById(id: number): DemoList | undefined {
  return DEMO_LISTS.find((l) => l.id === id)
}
