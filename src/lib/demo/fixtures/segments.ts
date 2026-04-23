interface DemoSegment {
  id: string
  client_id: string
  name: string
  logic: 'AND' | 'OR'
  rules: { field: string; operator: string; value: string | number | (string | number)[] }[]
  subscriber_count: number
  created_at: string
  updated_at: string
}

export const DEMO_SEGMENTS: DemoSegment[] = [
  {
    id: 'demo-seg-1',
    client_id: 'demo-client',
    name: 'Active openers (last 30 days)',
    logic: 'AND',
    rules: [
      { field: 'opens_last_30d', operator: '>=', value: 1 },
      { field: 'list_id', operator: 'in', value: [1, 3, 4] },
    ],
    subscriber_count: 18420,
    created_at: '2026-03-12T10:00:00Z',
    updated_at: '2026-04-22T10:00:00Z',
  },
  {
    id: 'demo-seg-2',
    client_id: 'demo-client',
    name: 'Premium subscribers',
    logic: 'AND',
    rules: [{ field: 'list_id', operator: 'in', value: [2] }],
    subscriber_count: 4218,
    created_at: '2026-02-08T10:00:00Z',
    updated_at: '2026-04-22T10:00:00Z',
  },
  {
    id: 'demo-seg-3',
    client_id: 'demo-client',
    name: 'Cold subscribers (no opens 90d)',
    logic: 'AND',
    rules: [
      { field: 'opens_last_90d', operator: '=', value: 0 },
      { field: 'created_at', operator: '<', value: '2025-12-01' },
    ],
    subscriber_count: 3287,
    created_at: '2026-01-22T10:00:00Z',
    updated_at: '2026-04-22T10:00:00Z',
  },
  {
    id: 'demo-seg-4',
    client_id: 'demo-client',
    name: 'High clickers (5+ clicks last quarter)',
    logic: 'AND',
    rules: [{ field: 'clicks_last_90d', operator: '>=', value: 5 }],
    subscriber_count: 1842,
    created_at: '2026-03-30T10:00:00Z',
    updated_at: '2026-04-22T10:00:00Z',
  },
  {
    id: 'demo-seg-5',
    client_id: 'demo-client',
    name: 'New subscribers (last 14 days)',
    logic: 'AND',
    rules: [{ field: 'created_at', operator: '>=', value: '2026-04-09' }],
    subscriber_count: 642,
    created_at: '2026-04-12T10:00:00Z',
    updated_at: '2026-04-22T10:00:00Z',
  },
]

export function getDemoSegmentById(id: string): DemoSegment | undefined {
  return DEMO_SEGMENTS.find((s) => s.id === id)
}
