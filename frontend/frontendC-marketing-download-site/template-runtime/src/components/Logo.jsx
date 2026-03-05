import { useId } from 'react'
import clsx from 'clsx'

export function Logo({ className, ...props }) {
  const gradientId = useId().replace(/:/g, '')

  return (
    <div
      {...props}
      className={clsx('inline-flex items-center gap-2', className)}
      aria-label="Maple"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center">
        <svg
          className="h-8 w-8"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={gradientId} cx="45%" cy="38%" r="55%">
              <stop offset="0%" stopColor="#ffb366" />
              <stop offset="100%" stopColor="#e8740c" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="14" r="12" fill={`url(#${gradientId})`} />
          <ellipse cx="12" cy="12" rx="1.8" ry="2.2" fill="#111" />
          <ellipse cx="20" cy="12" rx="1.8" ry="2.2" fill="#111" />
          <circle cx="12.6" cy="11.2" r="0.7" fill="#fff" />
          <circle cx="20.6" cy="11.2" r="0.7" fill="#fff" />
          <ellipse cx="9" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
          <ellipse cx="23" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
          <path
            d="M13 17.5 Q16 20 19 17.5"
            stroke="#111"
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="11" cy="27" rx="3.5" ry="2.2" fill="#d06800" />
          <ellipse cx="21" cy="27" rx="3.5" ry="2.2" fill="#d06800" />
        </svg>
      </span>
      <span className="text-base font-semibold tracking-tight text-zinc-900">
        Maple
      </span>
    </div>
  )
}
