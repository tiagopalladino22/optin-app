/**
 * Parses Listmonk campaign names into structured data.
 *
 * Supported patterns:
 *   "Copper - Issue #3 - 4/6/2026 (Friday)"
 *   "TWSW - 4/6/2026 (Monday)"          (no issue number)
 *   "OPL - Issue #1 - 4/6/2026 (Thursday)"
 *   "TGS - Issue #35 - 4/6/2026 (Thursday)"
 */

export interface ParsedCampaign {
  publicationCode: string
  issueNumber: number | null
  sendDate: string        // ISO date string (YYYY-MM-DD)
  sendDay: string         // Day of week (e.g. "Friday")
  issueName: string       // e.g. "TGS - Issue #35" or "TWSW"
}

const CAMPAIGN_PATTERN = /^(\w+)\s*-\s*(?:Issue\s*#(\d+)\s*-\s*)?(\d{1,2}\/\d{1,2}\/\d{4})\s*\((\w+)\)/i

export function parseCampaignName(name: string): ParsedCampaign | null {
  const match = name.match(CAMPAIGN_PATTERN)
  if (!match) return null

  const [, code, issueNum, dateStr, day] = match

  // Parse date from M/D/YYYY to YYYY-MM-DD
  const dateParts = dateStr.split('/')
  if (dateParts.length !== 3) return null

  const month = dateParts[0].padStart(2, '0')
  const dayOfMonth = dateParts[1].padStart(2, '0')
  const year = dateParts[2]
  const isoDate = `${year}-${month}-${dayOfMonth}`

  const publicationCode = code.toUpperCase()
  const issueNumber = issueNum ? parseInt(issueNum, 10) : null

  const issueName = issueNumber !== null
    ? `${publicationCode} - Issue #${issueNumber}`
    : publicationCode

  return {
    publicationCode,
    issueNumber,
    sendDate: isoDate,
    sendDay: day.charAt(0).toUpperCase() + day.slice(1).toLowerCase(),
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
