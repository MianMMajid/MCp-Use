'use client'

export function MapleMascot({ className, gradientId = 'kirbyBodyGrad' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mayple mascot"
    >
      <defs>
        <radialGradient id={gradientId} cx="45%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#ffb366" />
          <stop offset="100%" stopColor="#e8740c" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="90" r="72" fill={`url(#${gradientId})`} />
      <g className="kirby-eye kirby-eye-left">
        <ellipse cx="78" cy="78" rx="9" ry="12" fill="#111" />
        <circle cx="81" cy="73" r="3.5" fill="white" />
      </g>
      <g className="kirby-eye kirby-eye-right">
        <ellipse cx="122" cy="78" rx="9" ry="12" fill="#111" />
        <circle cx="125" cy="73" r="3.5" fill="white" />
      </g>
      <ellipse cx="58" cy="100" rx="14" ry="9" fill="#ff9966" opacity="0.5" />
      <ellipse cx="142" cy="100" rx="14" ry="9" fill="#ff9966" opacity="0.5" />
      <path d="M85 105 Q100 120 115 105" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="72" cy="168" rx="22" ry="14" fill="#d06800" />
      <ellipse cx="128" cy="168" rx="22" ry="14" fill="#d06800" />
    </svg>
  )
}
