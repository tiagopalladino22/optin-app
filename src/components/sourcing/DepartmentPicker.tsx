'use client'

import { useState, useMemo } from 'react'
import { APOLLO_DEPARTMENTS, DepartmentNode } from '@/lib/apollo-departments'

interface DepartmentPickerProps {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

// Collapsible tree of Apollo's Departments & Job Functions taxonomy.
// Each row is a button with a custom-drawn checkbox — avoids React's
// label+checkbox controlled-input sync issues.
export default function DepartmentPicker({ values, onChange, disabled }: DepartmentPickerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(values), [values])

  function toggle(value: string) {
    if (disabled) return
    const next = new Set(values)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(Array.from(next))
  }

  function toggleExpanded(value: string) {
    setExpanded((e) => ({ ...e, [value]: !e[value] }))
  }

  // Filter tree by search query. A parent matches if its own label matches OR any child matches.
  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return APOLLO_DEPARTMENTS
    const result: DepartmentNode[] = []
    for (const dept of APOLLO_DEPARTMENTS) {
      const parentMatch = dept.label.toLowerCase().includes(q)
      const children = (dept.children || []).filter((c) => c.label.toLowerCase().includes(q))
      if (parentMatch) {
        result.push(dept)
      } else if (children.length > 0) {
        result.push({ ...dept, children })
      }
    }
    return result
  }, [search])

  const autoExpand = search.trim().length > 0

  return (
    <div className="border border-border-custom rounded-lg bg-surface">
      <div className="px-3 py-2 border-b border-border-custom">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search departments and job functions…"
          disabled={disabled}
          className="w-full px-2 py-1 bg-transparent outline-none text-sm text-navy placeholder:text-text-light"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {filteredTree.map((dept) => {
          const isExpanded = autoExpand || expanded[dept.value]
          const parentChecked = selectedSet.has(dept.value)
          return (
            <div key={dept.value} className="border-b border-border-custom last:border-0">
              <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-offwhite">
                <button
                  type="button"
                  onClick={() => toggleExpanded(dept.value)}
                  className="text-text-light hover:text-text-mid text-xs w-4 shrink-0"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(dept.value)}
                  disabled={disabled}
                  className="flex-1 flex items-center gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckBox checked={parentChecked} />
                  <span className="text-sm font-medium text-navy">{dept.label}</span>
                </button>
              </div>
              {isExpanded && dept.children && (
                <div className="pl-8 pb-1">
                  {dept.children.map((child) => {
                    const childChecked = selectedSet.has(child.value)
                    return (
                      <button
                        type="button"
                        key={child.value}
                        onClick={() => toggle(child.value)}
                        disabled={disabled}
                        className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-offwhite rounded disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <CheckBox checked={childChecked} />
                        <span className="text-sm text-text-mid">{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {filteredTree.length === 0 && (
          <div className="px-3 py-4 text-sm text-text-light text-center">No matches</div>
        )}
      </div>
    </div>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
        checked ? 'bg-accent border-accent' : 'bg-surface border-border-custom'
      }`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  )
}
