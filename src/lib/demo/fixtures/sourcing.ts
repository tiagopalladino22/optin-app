import { DEMO_CLIENT_NAME } from '../config'

export function buildDemoSourcingResponse() {
  const today = new Date('2026-04-23T12:00:00Z')
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const weekStart = monday.toISOString().slice(0, 10)
  const weekEnd = sunday.toISOString().slice(0, 10)

  return {
    week: {
      id: 'demo-week-current',
      client_id: 'demo-client',
      week_start: weekStart,
      week_end: weekEnd,
      locked: false,
      created_at: monday.toISOString(),
    },
    client: {
      id: 'demo-client',
      name: DEMO_CLIENT_NAME,
      has_apollo_key: true,
      window_open: 1,
      window_close: 5,
    },
    window_is_open: true,
    is_locked: false,
    slots: [
      {
        id: 'demo-slot-1',
        week_id: 'demo-week-current',
        client_id: 'demo-client',
        slot_number: 1,
        filters: {
          person_locations: ['United States'],
          person_titles: ['Marketing Manager', 'Head of Growth'],
          person_seniorities: ['manager', 'director'],
          person_department_or_subdepartments: ['marketing'],
          industries: ['Computer Software'],
          organization_num_employees_ranges: ['51,200', '201,500'],
        },
        net_new_count: null,
        requested_count: null,
        status: 'draft',
        submitted_at: null,
      },
      {
        id: null,
        week_id: 'demo-week-current',
        client_id: 'demo-client',
        slot_number: 2,
        filters: {},
        net_new_count: null,
        requested_count: null,
        status: 'draft',
        submitted_at: null,
      },
      {
        id: null,
        week_id: 'demo-week-current',
        client_id: 'demo-client',
        slot_number: 3,
        filters: {},
        net_new_count: null,
        requested_count: null,
        status: 'draft',
        submitted_at: null,
      },
    ],
  }
}
