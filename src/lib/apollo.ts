// Apollo API client — mirrors the per-client Listmonk factory pattern in listmonk.ts.
// Apollo API keys are stored per-client on the clients table and never leave the server.

import { INDUSTRY_TAG_IDS } from './apollo-industries'

export interface SlotFilters {
  person_locations?: string[]                     // Apollo location strings ("United States", "San Francisco, California, US")
  person_titles?: string[]                        // free-text titles
  person_seniorities?: string[]                   // fixed Apollo enum (see APOLLO_SENIORITIES)
  person_department_or_subdepartments?: string[]  // Apollo department slugs (see apollo-departments.ts)
  industries?: string[]                           // Apollo canonical industry labels (see apollo-industries.ts)
  q_organization_keyword_tags?: string[]          // Free keyword tags
  organization_num_employees_ranges?: string[]    // Apollo range format e.g. "51,100"
}

// Apollo's canonical person_seniorities enum values.
export const APOLLO_SENIORITIES = [
  { value: 'owner', label: 'Owner' },
  { value: 'founder', label: 'Founder' },
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'partner', label: 'Partner' },
  { value: 'vp', label: 'VP' },
  { value: 'head', label: 'Head' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
  { value: 'intern', label: 'Intern' },
] as const

// Apollo's canonical organization_num_employees_ranges values.
export const APOLLO_EMPLOYEE_RANGES = [
  { value: '1,10', label: '1–10' },
  { value: '11,20', label: '11–20' },
  { value: '21,50', label: '21–50' },
  { value: '51,100', label: '51–100' },
  { value: '101,200', label: '101–200' },
  { value: '201,500', label: '201–500' },
  { value: '501,1000', label: '501–1,000' },
  { value: '1001,2000', label: '1,001–2,000' },
  { value: '2001,5000', label: '2,001–5,000' },
  { value: '5001,10000', label: '5,001–10,000' },
  { value: '10001,', label: '10,001+' },
] as const

export function createApolloFetch(apiKey: string) {
  return async function apolloFetch(path: string, body: unknown): Promise<Response> {
    const url = `https://api.apollo.io/v1/${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}

// Apollo endpoint paths.
// `mixed_people/search` returns Apollo's total count (all matching people,
// including contacts the team has already saved).
// `contacts/search` returns the subset already saved in the team's Apollo
// account. Net new = total - saved.
export const APOLLO_SEARCH_PATH = 'mixed_people/search'
export const APOLLO_CONTACTS_SEARCH_PATH = 'contacts/search'

// Build an Apollo mixed_people/search request body from slot filters.
// Only non-empty filter arrays are included — Apollo treats empty arrays
// differently than omitted ones for some fields (notably employee ranges),
// so we leave unused filters out entirely.
// `contact_email_status: ['verified']` matches Apollo UI's default filter.
// Industries with known tag IDs → `organization_industry_tag_ids` (strict);
// unknown industries fall back to `q_organization_keyword_tags` (fuzzy).
export function buildSearchBody(filters: SlotFilters, perPage = 1) {
  const industryIds: string[] = []
  const industryFallbackKeywords: string[] = []
  for (const label of filters.industries ?? []) {
    const id = INDUSTRY_TAG_IDS[label]
    if (id) industryIds.push(id)
    else industryFallbackKeywords.push(label)
  }
  const keywordTags = [
    ...industryFallbackKeywords,
    ...(filters.q_organization_keyword_tags ?? []),
  ]

  const body: Record<string, unknown> = {
    contact_email_status: ['verified'],
    page: 1,
    per_page: perPage,
  }
  if (filters.person_locations?.length) body.person_locations = filters.person_locations
  if (filters.person_titles?.length) body.person_titles = filters.person_titles
  if (filters.person_seniorities?.length) body.person_seniorities = filters.person_seniorities
  if (filters.person_department_or_subdepartments?.length) {
    body.person_department_or_subdepartments = filters.person_department_or_subdepartments
  }
  if (industryIds.length) body.organization_industry_tag_ids = industryIds
  if (keywordTags.length) body.q_organization_keyword_tags = keywordTags
  if (filters.organization_num_employees_ranges?.length) {
    body.organization_num_employees_ranges = filters.organization_num_employees_ranges
  }
  return body
}

// Returns true if at least one filter field has content.
export function hasAnyFilter(filters: SlotFilters): boolean {
  return Boolean(
    (filters.person_locations?.length ?? 0) ||
      (filters.person_titles?.length ?? 0) ||
      (filters.person_seniorities?.length ?? 0) ||
      (filters.person_department_or_subdepartments?.length ?? 0) ||
      (filters.industries?.length ?? 0) ||
      (filters.q_organization_keyword_tags?.length ?? 0) ||
      (filters.organization_num_employees_ranges?.length ?? 0)
  )
}
