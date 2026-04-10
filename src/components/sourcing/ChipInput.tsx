'use client'

import { useState, KeyboardEvent } from 'react'

interface ChipInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
}

// Free-text chip entry. Press Enter or comma to add, Backspace on empty input to remove last.
export default function ChipInput({ values, onChange, placeholder, disabled }: ChipInputProps) {
  const [draft, setDraft] = useState('')

  function addChip(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (values.includes(trimmed)) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  function removeChip(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addChip(draft)
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      removeChip(values.length - 1)
    }
  }

  return (
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addChip(draft)}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-navy placeholder:text-text-light"
        />
      )}
    </div>
  )
}
