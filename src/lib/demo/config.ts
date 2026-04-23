import type { SessionUser } from '../auth'

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
}

export const DEMO_SESSION: SessionUser = {
  id: 'demo-user',
  email: 'demo@tryoptin.com',
  role: 'client',
  clientId: 'demo-client',
}

export const DEMO_ALLOWED_SECTIONS = ['dashboard', 'lists', 'campaigns', 'sourcing', 'segments', 'stats']

export const DEMO_CLIENT_NAME = 'Demo Newsletter'
