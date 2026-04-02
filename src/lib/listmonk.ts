const LISTMONK_URL = process.env.LISTMONK_URL!
const LISTMONK_USERNAME = process.env.LISTMONK_USERNAME!
const LISTMONK_PASSWORD = process.env.LISTMONK_PASSWORD!

function getAuthHeader(): string {
  const credentials = Buffer.from(`${LISTMONK_USERNAME}:${LISTMONK_PASSWORD}`).toString('base64')
  return `Basic ${credentials}`
}

export async function listmonkFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${LISTMONK_URL}/api/${path}`
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
  }

  // Only set Content-Type for non-FormData bodies
  // FormData needs the browser to set the multipart boundary automatically
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  // Add 60-second timeout to prevent hanging forever
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...headers,
        ...options.headers,
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

// Create a listmonkFetch function for a specific client's Listmonk instance
export function createClientListmonkFetch(config: {
  url: string
  username: string
  password: string
}) {
  const baseUrl = config.url.replace(/\/+$/, '')
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64')

  return async function clientListmonkFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${baseUrl}/api/${path}`
    const headers: Record<string, string> = {
      Authorization: `Basic ${credentials}`,
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...headers,
          ...options.headers,
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}

// Filter Listmonk response data to only include resources owned by the client
export function filterToClientScope<T extends { id?: number }>(
  data: T[],
  allowedIds: number[]
): T[] {
  if (!allowedIds.length) return data
  return data.filter((item) => item.id !== undefined && allowedIds.includes(item.id))
}

// Types for Listmonk API responses
export interface ListmonkList {
  id: number
  uuid: string
  name: string
  type: string
  optin: string
  tags: string[]
  subscriber_count: number
  created_at: string
  updated_at: string
}

export interface ListmonkCampaign {
  id: number
  uuid: string
  name: string
  subject: string
  from_email: string
  status: 'draft' | 'running' | 'scheduled' | 'paused' | 'cancelled' | 'finished'
  type: string
  tags: string[]
  send_at: string | null
  started_at: string | null
  created_at: string
  updated_at: string
  lists: { id: number; name: string }[]
}

export interface ListmonkTemplate {
  id: number
  name: string
  type: string
  body: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ListmonkCampaignStats {
  sent: number
  views: number
  clicks: number
  bounces: number
  to_send: number
  progress: number
}
