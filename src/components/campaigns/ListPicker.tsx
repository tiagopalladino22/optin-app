'use client'

import { useState, useMemo } from 'react'

interface ListOption {
  id: number
  name: string
  subscriber_count?: number
}

interface ListPickerProps {
  lists: ListOption[]
  selected: number[]
  onChange: (ids: number[]) => void
}

/** Extract the code prefix from a list name (e.g. "OPL - Main List" → "OPL") */
function getCode(name: string): string {
  const match = name.match(/^([A-Za-z0-9]+)\s*[-–—]/)
  return match ? match[1].toUpperCase() : ''
}

export default function ListPicker({ lists, selected, onChange }: ListPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCode, setActiveCode] = useState<string | null>(null)

  // Extract unique codes from list names
  const codes = useMemo(() => {
    const codeSet = new Map<string, number>()
    for (const list of lists) {
      const code = getCode(list.name)
      if (code) codeSet.set(code, (codeSet.get(code) || 0) + 1)
    }
    // Only show codes that appear more than once (meaningful grouping)
    return Array.from(codeSet.entries())
      .filter(([, count]) => count > 1)
      .map(([code]) => code)
      .sort()
  }, [lists])

  // Filter lists by active code + search query
  const filtered = useMemo(() => {
    return lists.filter((list) => {
      if (activeCode && getCode(list.name) !== activeCode) return false
      if (search) {
        const q = search.toLowerCase()
        return list.name.toLowerCase().includes(q)
      }
      return true
    })
  }, [lists, activeCode, search])

  function toggle(id: number) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    )
  }

  const selectedCount = selected.length

  const totalRecipients = useMemo(() => {
    return lists
      .filter((l) => selected.includes(l.id))
      .reduce((sum, l) => sum + (l.subscriber_count || 0), 0)
  }, [lists, selected])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-text-mid">Lists</label>
        {selectedCount > 0 && (
          <span className="text-xs text-accent font-medium">
            {selectedCount} selected &middot; {totalRecipients.toLocaleString()} recipients
          </span>
        )}
      </div>

      {/* Code filter tabs */}
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCode(null)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeCode === null
                ? 'bg-accent text-white'
                : 'bg-offwhite text-text-mid hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {codes.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setActiveCode(activeCode === code ? null : code)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeCode === code
                  ? 'bg-accent text-white'
                  : 'bg-offwhite text-text-mid hover:bg-gray-200'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search lists..."
        className="w-full px-3 py-2 border border-border-custom rounded-lg text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
      />

      {/* List */}
      <div className="space-y-0.5 max-h-48 overflow-y-auto border border-border-custom rounded-lg p-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-text-light py-2 text-center">No lists found</p>
        ) : (
          filtered.map((list) => (
            <label
              key={list.id}
              className={`flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 transition-colors ${
                selected.includes(list.id)
                  ? 'bg-accent-wash text-navy font-medium'
                  : 'text-text-mid hover:bg-offwhite'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(list.id)}
                onChange={() => toggle(list.id)}
                className="rounded border-border-custom text-accent focus:ring-accent shrink-0"
              />
              <span className="truncate flex-1">{list.name}</span>
              {list.subscriber_count != null && (
                <span className="text-xs text-text-light shrink-0 tabular-nums">
                  {list.subscriber_count.toLocaleString()}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </div>
  )
}
