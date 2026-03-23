'use client'

import { useEffect, useState } from 'react'

export interface SegmentRule {
  id: string
  field: string
  operator: string
  value: string
}

export interface ListOption {
  id: number
  name: string
  subscriber_count: number
}

interface Props {
  rules: SegmentRule[]
  logic: 'and' | 'or'
  onChange: (rules: SegmentRule[]) => void
  onLogicChange: (logic: 'and' | 'or') => void
}

const FIELD_OPTIONS = [
  { value: '', label: '— Select filter —' },
  { value: 'from_lists', label: 'From lists' },
  { value: 'campaigns_received', label: 'Campaigns received' },
  { value: 'campaigns_opened', label: 'Campaigns opened' },
  { value: 'campaigns_clicked', label: 'Campaigns clicked' },
  { value: 'attribs.company', label: 'Company' },
  { value: 'attribs.job_title', label: 'Job Title' },
  { value: 'attribs.tags', label: 'Tags' },
  { value: 'date.subscribed', label: 'Subscribed date' },
]

const NUMBER_OPERATORS = [
  { value: 'gte', label: 'at least' },
  { value: 'eq', label: 'exactly' },
  { value: 'lte', label: 'at most' },
  { value: 'gt', label: 'more than' },
  { value: 'lt', label: 'less than' },
]

const TEXT_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'starts_with', label: 'starts with' },
]

const TAG_OPERATORS = [
  { value: 'includes', label: 'includes' },
  { value: 'excludes', label: 'excludes' },
]

const DATE_OPERATORS = [
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
]

function getOperators(field: string) {
  if (field === 'from_lists') return []
  if (field === 'campaigns_received' || field === 'campaigns_opened' || field === 'campaigns_clicked') return NUMBER_OPERATORS
  if (field === 'attribs.tags') return TAG_OPERATORS
  if (field.startsWith('attribs.')) return TEXT_OPERATORS
  if (field.startsWith('date.')) return DATE_OPERATORS
  return []
}

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function SegmentRuleEditor({ rules, logic, onChange, onLogicChange }: Props) {
  const [lists, setLists] = useState<ListOption[]>([])
  const [listsLoading, setListsLoading] = useState(true)
  const [listSearch, setListSearch] = useState('')

  useEffect(() => {
    async function fetchLists() {
      try {
        const res = await fetch('/api/listmonk/lists?per_page=100')
        const data = await res.json()
        setLists(
          (data.data?.results || []).map((l: ListOption) => ({
            id: l.id,
            name: l.name,
            subscriber_count: l.subscriber_count,
          }))
        )
      } catch {
        // ignore
      } finally {
        setListsLoading(false)
      }
    }
    fetchLists()
  }, [])

  const addRule = () => {
    onChange([...rules, { id: generateId(), field: '', operator: '', value: '' }])
  }

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id))
  }

  const updateRule = (id: string, updates: Partial<SegmentRule>) => {
    onChange(
      rules.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, ...updates }
        if (updates.field && updates.field !== r.field) {
          updated.operator = ''
          updated.value = ''
        }
        return updated
      })
    )
  }

  const toggleListSelection = (ruleId: string, listId: number, currentValue: string) => {
    const selected = currentValue ? currentValue.split(',').filter(Boolean) : []
    const listIdStr = String(listId)
    const next = selected.includes(listIdStr)
      ? selected.filter((id) => id !== listIdStr)
      : [...selected, listIdStr]
    updateRule(ruleId, { value: next.join(','), operator: 'in' })
  }

  return (
    <div className="space-y-4">
      {rules.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-mid">Match</span>
          <select
            value={logic}
            onChange={(e) => onLogicChange(e.target.value as 'and' | 'or')}
            className="border border-border-custom rounded-lg px-2 py-1 text-sm font-medium text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="and">ALL rules (AND)</option>
            <option value="or">ANY rule (OR)</option>
          </select>
        </div>
      )}

      {rules.map((rule, index) => {
        const operators = rule.field ? getOperators(rule.field) : []
        const isListField = rule.field === 'from_lists'
        const isNumberField = rule.field === 'campaigns_received' || rule.field === 'campaigns_opened' || rule.field === 'campaigns_clicked'
        const isDateField = rule.field?.startsWith('date.')
        const selectedListIds = isListField && rule.value
          ? rule.value.split(',').filter(Boolean)
          : []

        return (
          <div key={rule.id} className="space-y-2">
            <div className="flex items-start gap-2">
              {index > 0 && (
                <span className="mt-2 bg-offwhite text-text-mid uppercase rounded-lg px-2 py-0.5 text-xs font-medium w-10 text-center shrink-0">
                  {logic}
                </span>
              )}
              {index === 0 && rules.length > 1 && <div className="w-10 shrink-0" />}

              <div className="flex flex-wrap items-center gap-2 flex-1">
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                  className="border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {rule.field && operators.length > 0 && (
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                    className="border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">— Operator —</option>
                    {operators.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                )}

                {rule.field && !isListField && rule.operator && (
                  <input
                    type={isDateField ? 'date' : isNumberField ? 'number' : 'text'}
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder={isNumberField ? '0' : 'Value...'}
                    min={isNumberField ? '0' : undefined}
                    className="border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent w-44"
                  />
                )}
              </div>

              <button
                onClick={() => removeRule(rule.id)}
                className="mt-1 p-1 text-text-light hover:text-red-500 shrink-0"
                title="Remove rule"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* List selector dropdown */}
            {isListField && (
              <div className="ml-12 bg-offwhite rounded-lg border border-border-custom p-3 max-h-60 overflow-y-auto">
                {listsLoading ? (
                  <p className="text-sm text-text-light">Loading lists...</p>
                ) : lists.length === 0 ? (
                  <p className="text-sm text-text-light">No lists found.</p>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={listSearch}
                      onChange={(e) => setListSearch(e.target.value)}
                      placeholder="Search lists..."
                      className="block w-full border border-border-custom rounded-lg px-2 py-1.5 text-sm text-navy placeholder:text-text-light mb-2 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                    <p className="text-xs text-text-light mb-2">
                      {selectedListIds.length} selected
                    </p>
                    {lists
                      .filter((l) => !listSearch.trim() || l.name.toLowerCase().includes(listSearch.toLowerCase()))
                      .map((list) => {
                      const isSelected = selectedListIds.includes(String(list.id))
                      return (
                        <label
                          key={list.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                            isSelected ? 'bg-accent-wash text-accent' : 'hover:bg-white text-text-mid'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleListSelection(rule.id, list.id, rule.value)}
                            className="rounded border-border-custom text-accent focus:ring-accent"
                          />
                          <span className="flex-1">{list.name}</span>
                          <span className="text-xs text-text-light">
                            {list.subscriber_count.toLocaleString()} subs
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={addRule}
        className="text-sm text-accent hover:text-accent-bright font-medium"
      >
        + Add Rule
      </button>
    </div>
  )
}
