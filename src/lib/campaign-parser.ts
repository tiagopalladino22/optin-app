/**
 * Parses Listmonk campaign names into structured data.
 *
 * Supported patterns (publication prefix can be code OR full name):
 *   "Copper - Issue #3 - 4/6/2026 (Friday)"
 *   "TWSW - 4/6/2026 (Monday)"
 *   "OPL - Issue #1 - 4/6/2026 (Thursday)"
 *   "TGS - Issue #35 - 4/6/2026 (Thursday)"
 *   "Exact Insight - Issue #4 - 3/30/2026 (Monday)"   → matched to EIT
 *   "The Assist - Issue #12 - 4/1/2026 (Tuesday)"     → matched to TAS
 *   "Copper 2 - Issue #3 - 3/30/2026 (Friday)"        → matched to Copper 2 pub
 */

export interface ParsedCampaign {
  publicationCode: string
  issueNumber: number | null
  sendDate: string        // ISO date string (YYYY-MM-DD)
  sendDay: string         // Day of week (e.g. "Friday")
  issueName: string       // e.g. "EIT - Issue #4" or "TWSW"
}

export interface PublicationMapping {
  code: string
  name: string
}

// Date + day pattern at the end: M/D/YYYY (DayName)
const DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4})\s*\((\w+)\)/

// Issue number pattern
const ISSUE_PATTERN = /Issue\s*#(\d+)/i

/**
 * Parse a campaign name using known publication mappings.
 * Tries to match the campaign name prefix against publication names (longest match first),
 * then falls back to matching against publication codes.
 */
export function parseCampaignName(
  name: string,
  publications?: PublicationMapping[]
): ParsedCampaign | null {
  // Extract date and day
  const dateMatch = name.match(DATE_PATTERN)
  if (!dateMatch) return null

  const [, dateStr, day] = dateMatch

  // Parse date from M/D/YYYY to YYYY-MM-DD
  const dateParts = dateStr.split('/')
  if (dateParts.length !== 3) return null

  const month = dateParts[0].padStart(2, '0')
  const dayOfMonth = dateParts[1].padStart(2, '0')
  const year = dateParts[2]
  const isoDate = `${year}-${month}-${dayOfMonth}`

  // Extract issue number (optional)
  const issueMatch = name.match(ISSUE_PATTERN)
  const issueNumber = issueMatch ? parseInt(issueMatch[1], 10) : null

  // Get the prefix (everything before the date or "Issue #")
  const prefixEnd = issueMatch
    ? name.indexOf(issueMatch[0])
    : name.indexOf(dateStr)
  const rawPrefix = name.slice(0, prefixEnd).replace(/\s*-\s*$/, '').trim()

  // Match against known publications (by name, longest match first)
  let publicationCode: string | null = null

  if (publications && publications.length > 0) {
    // Sort by name length descending so "Copper 2" matches before "Copper"
    const sorted = [...publications].sort((a, b) => b.name.length - a.name.length)

    for (const pub of sorted) {
      if (rawPrefix.toLowerCase() === pub.name.toLowerCase()) {
        publicationCode = pub.code.toUpperCase()
        break
      }
    }

    // Also try matching by code directly
    if (!publicationCode) {
      for (const pub of sorted) {
        if (rawPrefix.toUpperCase() === pub.code.toUpperCase()) {
          publicationCode = pub.code.toUpperCase()
          break
        }
      }
    }
  }

  // Fallback: use the raw prefix as the code
  if (!publicationCode) {
    publicationCode = rawPrefix.toUpperCase()
  }

  const sendDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()

  const issueName = issueNumber !== null
    ? `${publicationCode} - Issue #${issueNumber}`
    : publicationCode

  return {
    publicationCode,
    issueNumber,
    sendDate: isoDate,
    sendDay,
    issueName,
  }
}

/**
 * Generates a grouping key for aggregating campaigns that belong to the same issue.
 * Groups by publication code + issue number (or date if no issue number).
 */
export function getIssueGroupKey(parsed: ParsedCampaign): string {
  if (parsed.issueNumber !== null) {
    return `${parsed.publicationCode}:#${parsed.issueNumber}`
  }
  return `${parsed.publicationCode}:${parsed.sendDate}`
}
