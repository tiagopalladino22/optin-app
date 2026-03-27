'use client'

interface CampaignStats {
  id: number
  name: string
  subject: string
  status: string
  sent: number
  views: number
  clicks: number
  bounces: number
  uniqueOpens: number
  uniqueClicks: number
  started_at: string | null
  created_at: string
}

interface Props {
  campaigns: CampaignStats[]
}

export default function CampaignStatsTable({ campaigns }: Props) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-text-mid">No campaigns with stats yet.</p>
  }

  return (
    <div className="bg-white rounded-xl border border-border-custom overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-custom bg-offwhite">
              <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Campaign</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Sent</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Delivered</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Unique Opens</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Total Opens</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Open %</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Unique Clicks</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Total Clicks</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">CTR</th>
              <th className="text-right px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Bounces</th>
              <th className="text-left px-4 py-3 text-text-light uppercase text-xs tracking-wider font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const delivered = c.sent - c.bounces
              const uniqueOpens = c.uniqueOpens || c.views
              const uniqueClicks = c.uniqueClicks || c.clicks
              const openRate = c.sent > 0 ? ((uniqueOpens / c.sent) * 100).toFixed(1) : '0.0'
              const clickRate = uniqueOpens > 0 ? ((uniqueClicks / uniqueOpens) * 100).toFixed(1) : '0.0'

              return (
                <tr key={c.id} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-light">{c.subject}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                    {c.sent.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                    {delivered.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                    {uniqueOpens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-text-light tabular-nums">
                    {c.views.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-accent font-medium tabular-nums">
                    {openRate}%
                  </td>
                  <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                    {uniqueClicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-text-light tabular-nums">
                    {c.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-accent font-medium tabular-nums">
                    {clickRate}%
                  </td>
                  <td className="px-4 py-3 text-right text-text-mid tabular-nums">
                    {c.bounces.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-text-light whitespace-nowrap">
                    {new Date(c.started_at || c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
