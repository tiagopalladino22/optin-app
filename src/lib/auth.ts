import { createServerSupabaseClient, createServiceRoleClient } from './supabase-server'
import { DEMO_SESSION, isDemoMode } from './demo/config'

export type UserRole = 'admin' | 'client'

export interface SessionUser {
  id: string
  email: string
  role: UserRole
  clientId: string | null
}

export async function getSession(): Promise<SessionUser | null> {
  if (isDemoMode()) return DEMO_SESSION

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  // Look up user's role and client association using service role to bypass RLS
  const serviceClient = await createServiceRoleClient()
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email!,
    role: (profile?.role as UserRole) || 'client',
    clientId: profile?.client_id || null,
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}
