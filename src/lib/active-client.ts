// Cookie that tells the server which client a user is currently "viewing as".
// Read server-side in getSession() via next/headers, written client-side from
// the InstanceSelector in DataProvider.

export const ACTIVE_CLIENT_COOKIE = 'optin_active_client'

export function setActiveClientCookie(clientId: string | null) {
  if (typeof document === 'undefined') return
  if (clientId) {
    document.cookie = `${ACTIVE_CLIENT_COOKIE}=${clientId}; path=/; max-age=31536000; samesite=lax`
  } else {
    document.cookie = `${ACTIVE_CLIENT_COOKIE}=; path=/; max-age=0`
  }
}
