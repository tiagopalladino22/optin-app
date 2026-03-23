'use client'

import CsvImport from '@/components/lists/CsvImport'

export default function ImportPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-3xl tracking-wide text-navy uppercase">Import Subscribers</h1>
      <CsvImport />
    </div>
  )
}
