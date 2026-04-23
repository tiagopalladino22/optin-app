'use client'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function DemoBanner() {
  if (!DEMO_MODE) return null

  return (
    <div className="bg-accent text-white text-sm py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-50">
      <span>You&rsquo;re viewing OPTIN&rsquo;s demo with sample data. No changes are saved.</span>
      <a
        href="https://tryoptin.com"
        className="underline font-semibold hover:opacity-80"
      >
        Sign up
      </a>
    </div>
  )
}
