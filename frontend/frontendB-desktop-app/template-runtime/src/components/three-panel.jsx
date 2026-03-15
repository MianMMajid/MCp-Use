'use client'

import clsx from 'clsx'

export function ThreePanel({ left, center, right, className }) {
  return (
    <div className={clsx('grid gap-6 lg:grid-cols-[280px_1fr_360px]', className)}>
      <div className="overflow-y-auto">{left}</div>
      <div className="min-w-0">{center}</div>
      <div className="overflow-y-auto">{right}</div>
    </div>
  )
}
