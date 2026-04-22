'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

interface ListOption {
  id: number
  name: string
  subscriber_count: number
}

interface CsvImportProps {
  listId?: number
  clientId?: string
}

type Step = 'upload' | 'map' | 'split' | 'preview' | 'importing' | 'done'

const STANDARD_FIELDS = [
  { value: '', label: '— Skip this column —' },
  { value: 'email', label: 'Email (required)' },
  { value: 'name', label: 'Name' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'phone', label: 'Phone' },
  { value: 'tags', label: 'Tags (comma-separated)' },
]

interface ImportResult {
  imported: number
  skipped: number
  errors?: string[]
  lists?: { name: string; count: number }[]
}

interface ListSplit {
  id: string
  name: string
  count: number
  existingListId?: number  // set when splitting to existing lists
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow)
  return { headers, rows }
}

function autoMapColumns(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}
  const patterns: Record<string, RegExp> = {
    email: /^e[-_]?mail/i,
    name: /^(full[-_]?)?name$/i,
    company: /^(company|org|organization)$/i,
    job_title: /^(job[-_]?title|title|position|role)$/i,
    phone: /^(phone|tel|telephone|mobile)$/i,
    tags: /^tags?$/i,
  }

  headers.forEach((header, index) => {
    for (const [field, regex] of Object.entries(patterns)) {
      if (regex.test(header)) {
        mapping[index] = field
        break
      }
    }
  })

  return mapping
}

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function CsvImport({ listId, clientId }: CsvImportProps) {
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({})
  const [customAttribs, setCustomAttribs] = useState<Record<number, string>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Split mode
  const [splitMode, setSplitMode] = useState<'single' | 'split' | 'split_existing'>(listId ? 'single' : 'split')
  const [listSplits, setListSplits] = useState<ListSplit[]>([])

  // List selector (when no listId provided)
  const [availableLists, setAvailableLists] = useState<ListOption[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(listId ?? null)
  const [listSearchQuery, setListSearchQuery] = useState('')

  useEffect(() => {
    if (!listId) {
      const url = clientId
        ? `/api/settings/client-lists?client_id=${clientId}`
        : '/api/listmonk/lists?per_page=100'
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          const results = clientId
            ? (data.data || [])
            : (data.data?.results || [])
          setAvailableLists(
            results.map((l: ListOption) => ({
              id: l.id,
              name: l.name,
              subscriber_count: l.subscriber_count,
            }))
          )
        })
        .catch(() => {})
    }
  }, [listId, clientId])

  const filteredAvailableLists = useMemo(() => {
    if (!listSearchQuery.trim()) return availableLists
    const q = listSearchQuery.toLowerCase()
    return availableLists.filter((l) => l.name.toLowerCase().includes(q))
  }, [availableLists, listSearchQuery])

  const targetListId = listId ?? selectedListId

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.')
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCsv(text)

      if (h.length === 0) {
        setError('CSV file appears to be empty.')
        return
      }
      if (r.length === 0) {
        setError('CSV file has no data rows.')
        return
      }

      setHeaders(h)
      setRows(r)
      setColumnMapping(autoMapColumns(h))
      setCustomAttribs({})
      setStep('map')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const updateMapping = (colIndex: number, value: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev }
      if (value === '') {
        delete next[colIndex]
      } else if (value === '__custom__') {
        delete next[colIndex]
        setCustomAttribs((p) => ({ ...p, [colIndex]: '' }))
        return next
      } else {
        next[colIndex] = value
        setCustomAttribs((p) => {
          const n = { ...p }
          delete n[colIndex]
          return n
        })
      }
      return next
    })
  }

  const updateCustomAttrib = (colIndex: number, name: string) => {
    setCustomAttribs((prev) => ({ ...prev, [colIndex]: name }))
  }

  const hasEmailMapping = useMemo(
    () => Object.values(columnMapping).includes('email'),
    [columnMapping]
  )

  const mappedSubscribers = useMemo(() => {
    return rows.map((row) => {
      const subscriber: Record<string, unknown> = {}
      const attribs: Record<string, string | string[]> = {}

      for (const [colIndexStr, field] of Object.entries(columnMapping)) {
        const colIndex = parseInt(colIndexStr)
        const value = row[colIndex] || ''
        if (!value) continue

        if (['email', 'name'].includes(field)) {
          subscriber[field] = value
        } else if (field === 'tags') {
          attribs.tags = value.split(',').map((t) => t.trim()).filter(Boolean)
        } else {
          attribs[field] = value
        }
      }

      for (const [colIndexStr, attribName] of Object.entries(customAttribs)) {
        const colIndex = parseInt(colIndexStr)
        const value = row[colIndex] || ''
        if (attribName && value) {
          attribs[attribName] = value
        }
      }

      if (Object.keys(attribs).length > 0) {
        subscriber.attribs = attribs
      }

      return subscriber
    })
  }, [rows, columnMapping, customAttribs])

  const validSubscribers = useMemo(
    () => mappedSubscribers.filter((s) => s.email),
    [mappedSubscribers]
  )

  const previewRows = useMemo(() => validSubscribers.slice(0, 5), [validSubscribers])

  // Split helpers
  const totalAssigned = useMemo(
    () => listSplits.reduce((sum, s) => sum + s.count, 0),
    [listSplits]
  )
  const remaining = validSubscribers.length - totalAssigned

  const addListSplit = () => {
    setListSplits((prev) => [
      ...prev,
      { id: generateId(), name: '', count: 0 },
    ])
  }

  const removeListSplit = (id: string) => {
    setListSplits((prev) => prev.filter((s) => s.id !== id))
  }

  const updateListSplit = (id: string, updates: Partial<ListSplit>) => {
    setListSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }

  const splitIsValid = useMemo(() => {
    if (splitMode === 'single') {
      return !!targetListId
    }
    if (splitMode === 'split_existing') {
      if (listSplits.length === 0) return false
      if (listSplits.some((s) => !s.existingListId || s.count <= 0)) return false
      if (totalAssigned > validSubscribers.length) return false
      return true
    }
    if (listSplits.length === 0) return false
    if (listSplits.some((s) => !s.name.trim() || s.count <= 0)) return false
    if (totalAssigned > validSubscribers.length) return false
    return true
  }, [splitMode, listSplits, totalAssigned, validSubscribers.length, targetListId])

  const handleGoToSplit = () => {
    // Initialize with one list split if empty
    if (listSplits.length === 0) {
      setListSplits([{ id: generateId(), name: '', count: validSubscribers.length }])
    }
    setStep('split')
  }

  const [importProgress, setImportProgress] = useState('')

  const handleImport = async () => {
    setStep('importing')
    setError(null)
    setImportProgress('')

    const BATCH_SIZE = 3000

    try {
      if (splitMode === 'single') {
        let totalImported = 0
        let totalSkipped = 0
        const totalBatches = Math.ceil(validSubscribers.length / BATCH_SIZE)

        for (let i = 0; i < validSubscribers.length; i += BATCH_SIZE) {
          const batch = validSubscribers.slice(i, i + BATCH_SIZE)
          const batchNum = Math.floor(i / BATCH_SIZE) + 1
          setImportProgress(`Batch ${batchNum} of ${totalBatches} (${Math.min(i + BATCH_SIZE, validSubscribers.length).toLocaleString()} / ${validSubscribers.length.toLocaleString()})`)

          const res = await fetch('/api/import/subscribers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listId: targetListId,
              subscribers: batch,
              clientId: clientId || undefined,
            }),
          })

          const text = await res.text()
          let data
          try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
          if (!res.ok) throw new Error(data.error || `Batch ${batchNum} failed`)

          totalImported += data.imported || 0
          totalSkipped += data.skipped || 0
        }

        setResult({ imported: totalImported, skipped: totalSkipped })
      } else if (splitMode === 'split_existing') {
        // Split to existing lists — batch subscribers to each list
        let offset = 0
        const listResults: { name: string; count: number }[] = []

        for (let s = 0; s < listSplits.length; s++) {
          const split = listSplits[s]
          if (!split.existingListId) continue
          const splitSubs = validSubscribers.slice(offset, offset + split.count)
          offset += split.count
          let splitImported = 0

          const totalSplitBatches = Math.ceil(splitSubs.length / BATCH_SIZE)
          for (let i = 0; i < splitSubs.length; i += BATCH_SIZE) {
            const batch = splitSubs.slice(i, i + BATCH_SIZE)
            const batchNum = Math.floor(i / BATCH_SIZE) + 1
            setImportProgress(`"${split.name}" — batch ${batchNum} of ${totalSplitBatches} (list ${s + 1} of ${listSplits.length})`)

            const res = await fetch('/api/import/subscribers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                listId: split.existingListId,
                subscribers: batch,
                clientId: clientId || undefined,
              }),
            })

            const text = await res.text()
            let data
            try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
            if (!res.ok) throw new Error(data.error || `Batch for "${split.name}" failed`)
            splitImported += data.imported || 0
          }

          listResults.push({ name: split.name, count: splitImported })
        }

        setResult({
          imported: listResults.reduce((sum, r) => sum + r.count, 0),
          skipped: 0,
          lists: listResults,
        })
      } else {
        // Split import — send each split separately with its own subscribers (create new lists)
        let offset = 0
        const listResults: { name: string; count: number }[] = []

        for (let s = 0; s < listSplits.length; s++) {
          const split = listSplits[s]
          const splitSubs = validSubscribers.slice(offset, offset + split.count)
          offset += split.count
          setImportProgress(`Creating list "${split.name.trim()}" (${s + 1} of ${listSplits.length})`)

          // Send this split's subscribers in batches
          // First batch creates the list via split endpoint
          const firstBatch = splitSubs.slice(0, BATCH_SIZE)
          const createRes = await fetch('/api/import/subscribers-split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscribers: firstBatch,
              splits: [{ name: split.name.trim(), count: firstBatch.length }],
              clientId: clientId || undefined,
            }),
          })

          const createText = await createRes.text()
          let createData
          try { createData = JSON.parse(createText) } catch { throw new Error(createText.slice(0, 200)) }
          if (!createRes.ok) throw new Error(createData.error || `Split "${split.name}" failed`)

          let splitImported = createData.imported || firstBatch.length
          const createdListId = createData.lists?.[0]?.id

          // Send remaining batches to the created list
          if (createdListId && splitSubs.length > BATCH_SIZE) {
            for (let i = BATCH_SIZE; i < splitSubs.length; i += BATCH_SIZE) {
              const batch = splitSubs.slice(i, i + BATCH_SIZE)
              const batchNum = Math.floor(i / BATCH_SIZE) + 1
              const totalSplitBatches = Math.ceil(splitSubs.length / BATCH_SIZE)
              setImportProgress(`"${split.name.trim()}" — batch ${batchNum + 1} of ${totalSplitBatches}`)

              const res = await fetch('/api/import/subscribers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  listId: createdListId,
                  subscribers: batch,
                  clientId: clientId || undefined,
                }),
              })

              const text = await res.text()
              let data
              try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
              if (!res.ok) throw new Error(data.error || `Batch for "${split.name}" failed`)
              splitImported += data.imported || 0
            }
          }

          listResults.push({ name: split.name.trim(), count: splitImported })
        }

        setResult({
          imported: listResults.reduce((sum, r) => sum + r.count, 0),
          skipped: 0,
          lists: listResults,
        })
      }

      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setColumnMapping({})
    setCustomAttribs({})
    setResult(null)
    setError(null)
    setSplitMode(listId ? 'single' : 'split')
    setListSplits([])
    setSelectedListId(listId ?? null)
    setListSearchQuery('')
  }

  return (
    <div className="bg-surface rounded-xl border border-border-custom p-6">
      <h2 className="text-lg font-medium text-navy mb-2">Import Subscribers</h2>
      <p className="text-sm text-text-light mb-4">
        Upload a CSV file to import subscribers. You can import to this list or split into multiple new lists.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragOver
              ? 'border-accent bg-accent-wash'
              : 'border-border-custom hover:border-text-light'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <svg
            className="mx-auto h-10 w-10 text-text-light mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-text-mid mb-2">
            Drag and drop your CSV file here, or
          </p>
          <label className="inline-block cursor-pointer">
            <span className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-bright transition-colors">
              Choose File
            </span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
          <p className="text-xs text-text-light mt-3">
            Supported fields: email, name, company, job_title, phone, tags, + custom attributes
          </p>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'map' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-mid">
              Found <span className="font-medium text-navy">{rows.length}</span> rows and{' '}
              <span className="font-medium text-navy">{headers.length}</span> columns.
              Map each CSV column to a subscriber field.
            </p>
            <button
              onClick={reset}
              className="text-sm text-text-light hover:text-text-mid"
            >
              Start over
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-custom bg-offwhite">
                  <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">CSV Column</th>
                  <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Sample Data</th>
                  <th className="text-left py-2 text-text-light uppercase text-xs tracking-wider font-medium">Map To</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, idx) => (
                  <tr key={idx} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                    <td className="py-2 pr-4 font-mono text-navy">{header}</td>
                    <td className="py-2 pr-4 text-text-light truncate max-w-[200px]">
                      {rows[0]?.[idx] || '—'}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            columnMapping[idx] || (idx in customAttribs ? '__custom__' : '')
                          }
                          onChange={(e) => updateMapping(idx, e.target.value)}
                          className="block w-48 border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        >
                          {STANDARD_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                          <option value="__custom__">Custom attribute...</option>
                        </select>
                        {idx in customAttribs && (
                          <input
                            type="text"
                            value={customAttribs[idx]}
                            onChange={(e) => updateCustomAttrib(idx, e.target.value)}
                            placeholder="Attribute name"
                            className="block w-36 border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasEmailMapping && (
            <p className="text-sm text-amber-600">
              You must map at least one column to Email to proceed.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleGoToSplit}
              disabled={!hasEmailMapping}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Split Configuration */}
      {step === 'split' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-mid">
              <span className="font-medium text-navy">{validSubscribers.length}</span> valid subscribers ready to import.
            </p>
            <button
              onClick={reset}
              className="text-sm text-text-light hover:text-text-mid"
            >
              Start over
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-3">
            <button
              onClick={() => setSplitMode('single')}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                splitMode === 'single'
                  ? 'border-accent bg-accent-wash text-accent'
                  : 'border-border-custom text-text-mid hover:bg-offwhite'
              }`}
            >
              Import to this list
            </button>
            <button
              onClick={() => {
                setSplitMode('split')
                if (listSplits.length === 0) {
                  setListSplits([
                    { id: generateId(), name: '', count: validSubscribers.length },
                  ])
                }
              }}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                splitMode === 'split'
                  ? 'border-accent bg-accent-wash text-accent'
                  : 'border-border-custom text-text-mid hover:bg-offwhite'
              }`}
            >
              Split into new lists
            </button>
            <button
              onClick={() => {
                setSplitMode('split_existing')
                setListSplits([])
              }}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                splitMode === 'split_existing'
                  ? 'border-accent bg-accent-wash text-accent'
                  : 'border-border-custom text-text-mid hover:bg-offwhite'
              }`}
            >
              Split into existing lists
            </button>
          </div>

          {/* List selector for single mode when no listId */}
          {splitMode === 'single' && !listId && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-mid">Select target list</label>
              <input
                type="text"
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
                placeholder="Search lists..."
                className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              <div className="max-h-48 overflow-y-auto border border-border-custom rounded-lg">
                {filteredAvailableLists.length === 0 ? (
                  <p className="p-3 text-sm text-text-light">No lists found.</p>
                ) : (
                  filteredAvailableLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => setSelectedListId(list.id)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                        selectedListId === list.id
                          ? 'bg-accent-wash text-accent'
                          : 'hover:bg-offwhite/50 text-text-mid'
                      }`}
                    >
                      <span>{list.name}</span>
                      <span className="text-xs text-text-light">{list.subscriber_count.toLocaleString()} subs</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Split to existing lists */}
          {splitMode === 'split_existing' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-light">
                  Select existing lists and assign row counts.
                </p>
                <div className="text-sm">
                  <span className={remaining < 0 ? 'text-red-600 font-medium' : 'text-text-light'}>
                    {remaining < 0
                      ? `${Math.abs(remaining)} over limit`
                      : `${remaining} unassigned`}
                  </span>
                  <span className="text-text-light"> / {validSubscribers.length} total</span>
                </div>
              </div>

              {/* Add list selector */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={listSearchQuery}
                  onChange={(e) => setListSearchQuery(e.target.value)}
                  placeholder="Search lists to add..."
                  className="block w-full border border-border-custom rounded-lg px-3 py-2 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <div className="max-h-36 overflow-y-auto border border-border-custom rounded-lg">
                  {filteredAvailableLists
                    .filter((l) => !listSplits.some((s) => s.existingListId === l.id))
                    .map((list) => (
                      <button
                        key={list.id}
                        onClick={() => {
                          const perList = listSplits.length === 0 ? validSubscribers.length : 0
                          setListSplits((prev) => [
                            ...prev,
                            { id: generateId(), name: list.name, count: perList, existingListId: list.id },
                          ])
                        }}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-offwhite/50 text-text-mid transition-colors"
                      >
                        <span>{list.name}</span>
                        <span className="text-xs text-text-light">{list.subscriber_count.toLocaleString()} subs</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Selected lists with counts */}
              {listSplits.map((split, index) => (
                <div
                  key={split.id}
                  className="flex items-center gap-3 bg-offwhite rounded-lg border border-border-custom p-3"
                >
                  <span className="text-sm font-medium text-text-light w-6 shrink-0">
                    {index + 1}.
                  </span>
                  <span className="flex-1 text-sm text-navy font-medium truncate">
                    {split.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      value={split.count || ''}
                      onChange={(e) =>
                        updateListSplit(split.id, {
                          count: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      placeholder="0"
                      min="0"
                      max={validSubscribers.length}
                      className="w-24 border border-border-custom rounded-lg px-3 py-1.5 text-sm text-right text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                    <span className="text-xs text-text-light">rows</span>
                  </div>
                  <button
                    onClick={() => removeListSplit(split.id)}
                    className="p-1 text-text-light hover:text-red-500 shrink-0"
                    title="Remove"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}

              {remaining > 0 && listSplits.length > 0 && (
                <button
                  onClick={() => {
                    const perList = Math.floor(remaining / listSplits.length)
                    const extra = remaining % listSplits.length
                    setListSplits((prev) =>
                      prev.map((s, i) => ({
                        ...s,
                        count: s.count + perList + (i < extra ? 1 : 0),
                      }))
                    )
                  }}
                  className="text-sm text-text-light hover:text-text-mid"
                >
                  Distribute remaining evenly
                </button>
              )}

              {remaining < 0 && (
                <p className="text-sm text-red-600">
                  You have assigned more rows than available. Please reduce the counts.
                </p>
              )}
            </div>
          )}

          {/* Split configuration (new lists) */}
          {splitMode === 'split' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-light">
                  Rows will be assigned in order from the CSV file.
                </p>
                <div className="text-sm">
                  <span className={remaining < 0 ? 'text-red-600 font-medium' : 'text-text-light'}>
                    {remaining < 0
                      ? `${Math.abs(remaining)} over limit`
                      : `${remaining} unassigned`}
                  </span>
                  <span className="text-text-light"> / {validSubscribers.length} total</span>
                </div>
              </div>

              {listSplits.map((split, index) => (
                <div
                  key={split.id}
                  className="flex items-center gap-3 bg-offwhite rounded-lg border border-border-custom p-3"
                >
                  <span className="text-sm font-medium text-text-light w-6 shrink-0">
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={split.name}
                    onChange={(e) => updateListSplit(split.id, { name: e.target.value })}
                    placeholder="List name"
                    className="flex-1 border border-border-custom rounded-lg px-3 py-1.5 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      value={split.count || ''}
                      onChange={(e) =>
                        updateListSplit(split.id, {
                          count: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      placeholder="0"
                      min="0"
                      max={validSubscribers.length}
                      className="w-24 border border-border-custom rounded-lg px-3 py-1.5 text-sm text-right text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                    <span className="text-xs text-text-light">rows</span>
                  </div>
                  {listSplits.length > 1 && (
                    <button
                      onClick={() => removeListSplit(split.id)}
                      className="p-1 text-text-light hover:text-red-500 shrink-0"
                      title="Remove list"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-3">
                <button
                  onClick={addListSplit}
                  className="text-sm text-accent hover:text-accent-bright font-medium"
                >
                  + Add List
                </button>
                {remaining > 0 && listSplits.length > 0 && (
                  <button
                    onClick={() => {
                      // Distribute remaining evenly across lists
                      const perList = Math.floor(remaining / listSplits.length)
                      const extra = remaining % listSplits.length
                      setListSplits((prev) =>
                        prev.map((s, i) => ({
                          ...s,
                          count: s.count + perList + (i < extra ? 1 : 0),
                        }))
                      )
                    }}
                    className="text-sm text-text-light hover:text-text-mid"
                  >
                    Distribute remaining evenly
                  </button>
                )}
              </div>

              {remaining < 0 && (
                <p className="text-sm text-red-600">
                  You have assigned more rows than available. Please reduce the counts.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setStep('map')}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Back
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!splitIsValid}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-bright font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Import
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {splitMode === 'split' ? (
            <>
              <p className="text-sm text-text-mid">
                Will create <span className="font-medium text-navy">{listSplits.length}</span> lists:
              </p>
              <div className="space-y-2">
                {(() => {
                  let offset = 0
                  return listSplits.map((split) => {
                    const start = offset
                    const end = offset + split.count
                    offset = end
                    return (
                      <div key={split.id} className="bg-offwhite rounded-lg border border-border-custom p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-navy">{split.name}</span>
                          <span className="text-xs text-text-light">
                            {split.count} subscribers (rows {start + 1}–{Math.min(end, validSubscribers.length)})
                          </span>
                        </div>
                        <div className="text-xs text-text-light space-y-0.5">
                          {validSubscribers.slice(start, Math.min(start + 3, end)).map((s, i) => (
                            <p key={i}>{s.email as string}</p>
                          ))}
                          {split.count > 3 && (
                            <p className="text-text-light">...and {split.count - 3} more</p>
                          )}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
              {remaining > 0 && (
                <p className="text-sm text-amber-600">
                  {remaining} rows will not be imported (unassigned).
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-text-mid">
                Preview of the first {previewRows.length} subscribers out of{' '}
                <span className="font-medium text-navy">{validSubscribers.length}</span> total.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-custom bg-offwhite">
                      <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Email</th>
                      <th className="text-left py-2 pr-4 text-text-light uppercase text-xs tracking-wider font-medium">Name</th>
                      <th className="text-left py-2 text-text-light uppercase text-xs tracking-wider font-medium">Attributes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((sub, idx) => (
                      <tr key={idx} className="border-b border-border-custom last:border-0 hover:bg-offwhite/50">
                        <td className="py-2 pr-4 text-navy">{sub.email as string}</td>
                        <td className="py-2 pr-4 text-text-mid">{(sub.name as string) || '—'}</td>
                        <td className="py-2 text-text-light text-xs font-mono">
                          {sub.attribs
                            ? JSON.stringify(sub.attribs, null, 0).slice(0, 80)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setStep('split')}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium"
            >
              {splitMode === 'split'
                ? `Create ${listSplits.length} Lists & Import`
                : `Import ${validSubscribers.length} Subscribers`}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Importing */}
      {step === 'importing' && (
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent border-r-transparent mb-3" />
          <p className="text-sm text-text-mid">
            {splitMode === 'split'
              ? 'Creating lists and importing subscribers...'
              : 'Importing subscribers...'}
          </p>
          {importProgress && (
            <p className="text-xs text-text-light mt-2">{importProgress}</p>
          )}
        </div>
      )}

      {/* Step 6: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-sm font-medium text-emerald-800">Import Complete</p>
            {result.lists ? (
              <div className="mt-2 space-y-1">
                {result.lists.map((l, i) => (
                  <p key={i} className="text-sm text-emerald-700">
                    <span className="font-medium">{l.name}</span> — {l.count} subscribers
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-emerald-700 mt-1">
                Successfully imported <span className="font-medium">{result.imported}</span> subscribers.
                {result.skipped > 0 && (
                  <> Skipped <span className="font-medium">{result.skipped}</span> (duplicates or invalid).</>
                )}
              </p>
            )}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-medium text-amber-800 mb-1">Warnings</p>
              <ul className="text-sm text-amber-700 list-disc list-inside">
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {result.errors.length > 5 && (
                  <li>...and {result.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm border border-border-custom text-text-mid hover:bg-surface rounded-lg"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
