import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceRoleClient } from './supabase-server'
import { DEMO_SESSION, isDemoMode } from './demo/config'
import { ACTIVE_CLIENT_COOKIE } from './active-client'

export type UserRole = 'admin' | 'client'

export interface SessionUser {
  id: string
  email: string
  role: UserRole
  /** Currently active client (chosen via the navbar selector cookie, falls back to primary). */
  clientId: string | null
  /** The user's primary/default client — where they land on login. */
  primaryClientId: string | null
  /** Every client this user is allowed to switch to. Empty for admins (they can switch to any). */
  allowedClientIds: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getSession(): Promise<SessionUser | null> {
  if (isDemoMode()) return DEMO_SESSION

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  const serviceClient = await createServiceRoleClient()
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const role: UserRole = (profile?.role as UserRole) || 'client'
  const primaryClientId = (profile?.client_id as string | null) || null

  // Pull the user's allowed clients (only meaningful for client-role users).
  let allowedClientIds: string[] = []
  if (role !== 'admin') {
    const { data: rows } = await serviceClient
      .from('user_clients')
      .select('client_id')
      .eq('user_id', user.id)
    allowedClientIds = (rows ?? []).map((r) => r.client_id as string)
    // Fallback: if no user_clients row exists yet (legacy/unbackfilled), seed
    // from the primary so the app still works.
    if (allowedClientIds.length === 0 && primaryClientId) {
      allowedClientIds = [primaryClientId]
    }
  }

  // Resolve which client this request is "viewing as" — prefer the cookie if
  // it points at a client the user is actually allowed to view.
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ACTIVE_CLIENT_COOKIE)?.value || null
  const cookieIsValidUuid = !!cookieValue && UUID_RE.test(cookieValue)

  let activeClientId: string | null
  if (role === 'admin') {
    // Admins can view any client; trust the cookie if it's a valid UUID.
    activeClientId = cookieIsValidUuid ? cookieValue : null
  } else {
    activeClientId =
      cookieIsValidUuid && allowedClientIds.includes(cookieValue!)
        ? cookieValue
        : primaryClientId
  }

  return {
    id: user.id,
    email: user.email!,
    role,
    clientId: activeClientId,
    primaryClientId,
    allowedClientIds,
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}
