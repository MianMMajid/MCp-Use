'use client'

import { Select } from '@/components/select'
import { Input, InputGroup } from '@/components/input'
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'

export function FilterBar({ filters = [], searchValue, onSearchChange, onSearchSubmit }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onSearchChange && (
        <div className="w-64">
          <InputGroup>
            <MagnifyingGlassIcon />
            <Input
              placeholder="Search..."
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit?.()}
            />
          </InputGroup>
        </div>
      )}
      {filters.map(({ name, label, options, value, onChange }) => (
        <div key={name} className="w-36">
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{label}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  )
}
