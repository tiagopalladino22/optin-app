'use client'

interface ChipToggleOption {
  value: string
  label: string
}

interface ChipToggleProps {
  options: readonly ChipToggleOption[]
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

// Multi-select fixed-option toggle chips. Click to toggle.
export default function ChipToggle({ options, values, onChange, disabled }: ChipToggleProps) {
  function toggle(value: string) {
    if (disabled) return
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value))
    } else {
      onChange([...values, value])
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = values.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            disabled={disabled}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'bg-offwhite text-text-mid hover:bg-border-custom'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
