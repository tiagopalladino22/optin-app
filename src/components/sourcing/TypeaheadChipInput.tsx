'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'

interface Suggestion {
  label: string
  count?: number
}

interface TypeaheadChipInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
  // Async loader that returns suggestions for a query string.
  // Return an empty array to show "no matches".
  loadSuggestions: (query: string) => Promise<Suggestion[]>
  debounceMs?: number
  // If true, allow adding arbitrary text even without a matching suggestion.
  allowFreeText?: boolean
}

// Chip input backed by an async typeahead. Debounces the query, lets users click
// or press Enter on a suggestion to add it. If allowFreeText is false and there
// are no matches, the chip is not added.
export default function TypeaheadChipInput({
  values,
  onChange,
  placeholder,
  disabled,
  loadSuggestions,
  debounceMs = 300,
  allowFreeText = false,
}: TypeaheadChipInputProps) {
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestQueryRef = useRef('')

  useEffect(() => {
    if (!draft.trim()) {
      setSuggestions([])
      return
    }
    latestQueryRef.current = draft
    setLoading(true)
    const handle = setTimeout(async () => {
      const query = draft
      try {
        const results = await loadSuggestions(query)
        // Guard against stale responses
        if (latestQueryRef.current !== query) return
        setSuggestions(results)
        setHighlightIdx(0)
      } finally {
        if (latestQueryRef.current === query) {
          setLoading(false)
        }
      }
    }, debounceMs)
    return () => clearTimeout(handle)
  }, [draft, loadSuggestions, debounceMs])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [])

  function addChip(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    if (values.includes(trimmed)) {
      setDraft('')
      setOpen(false)
      return
    }
    onChange([...values, trimmed])
    setDraft('')
    setSuggestions([])
    setOpen(false)
  }

  function removeChip(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        addChip(suggestions[highlightIdx].label)
      } else if (allowFreeText) {
        addChip(draft)
      }
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      removeChip(values.length - 1)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 px-3 py-2 bg-surface border border-border-custom rounded-lg focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-wash text-accent rounded-pill text-xs font-medium"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeChip(i)}
                className="hover:text-accent-bright leading-none"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={values.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-navy placeholder:text-text-light"
          />
        )}
      </div>

      {open && draft.trim() && (
        <div className="absolute z-10 mt-1 left-0 right-0 bg-surface border border-border-custom rounded-lg shadow-apple max-h-60 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-text-light">Searching…</div>}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-light">
              {allowFreeText ? 'Press Enter to add' : 'No matches found'}
            </div>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <button
                key={`${s.label}-${i}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  addChip(s.label)
                }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`block w-full text-left px-3 py-2 text-sm text-navy ${
                  i === highlightIdx ? 'bg-accent-wash' : 'hover:bg-offwhite'
                }`}
              >
                <span>{s.label}</span>
                {typeof s.count === 'number' && (
                  <span className="ml-2 text-xs text-text-light">
                    {s.count.toLocaleString()} contacts
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
