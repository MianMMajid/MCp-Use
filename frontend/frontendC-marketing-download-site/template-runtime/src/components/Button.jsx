import Link from 'next/link'
import clsx from 'clsx'

const baseStyles = {
  solid: [
    'group inline-flex items-center justify-center rounded-full py-2.5 px-5 text-sm font-semibold min-h-[44px]',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'transition-all duration-200',
    // Hover — lift + scale + shadow
    'hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-md',
    // Active — press down, reset scale
    'active:translate-y-0 active:scale-100 active:shadow-sm',
    // Disabled — suppress all hover/active effects
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:shadow-none disabled:active:translate-y-0',
  ].join(' '),
  outline: [
    'group inline-flex ring-1 items-center justify-center rounded-full py-2.5 px-5 text-sm min-h-[44px]',
    'transition-all duration-200',
    // Hover — lift + scale + shadow (outline buttons now get shadow too)
    'hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-sm',
    // Active — press down, reset scale
    'active:translate-y-0 active:scale-100',
    // Disabled — suppress all hover/active effects
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:shadow-none disabled:active:translate-y-0',
  ].join(' '),
}

const variantStyles = {
  solid: {
    zinc: 'bg-zinc-900 text-white hover:bg-zinc-700 hover:text-zinc-100 active:bg-zinc-800 active:text-zinc-300 focus-visible:outline-zinc-900',
    orange: 'bg-orange-600 text-white hover:bg-orange-700 hover:text-white hover:shadow-orange-500/25 active:bg-orange-800 active:text-orange-100 focus-visible:outline-orange-600',
    white: 'bg-white text-zinc-900 hover:bg-orange-50 active:bg-orange-200 active:text-zinc-600 focus-visible:outline-white',
  },
  outline: {
    zinc: 'ring-zinc-200 text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300 hover:bg-zinc-50 active:bg-zinc-100 active:text-zinc-600 focus-visible:outline-orange-600 focus-visible:ring-zinc-300',
    white: 'ring-zinc-700 text-white hover:ring-zinc-500 hover:bg-white/5 active:ring-zinc-700 active:text-zinc-400 focus-visible:outline-white',
  },
}

export function Button({ className, external, ...props }) {
  props.variant ??= 'solid'
  props.color ??= 'zinc'

  className = clsx(
    baseStyles[props.variant],
    props.variant === 'outline'
      ? variantStyles.outline[props.color]
      : props.variant === 'solid'
        ? variantStyles.solid[props.color]
        : undefined,
    className,
  )

  // Auto-detect external protocols (mailto:, tel:, http://, https://)
  const isExternal =
    external ||
    (typeof props.href === 'string' &&
      /^(https?:|mailto:|tel:)/.test(props.href))

  return typeof props.href === 'undefined' ? (
    <button className={className} {...props} />
  ) : isExternal ? (
    <a className={className} {...props} />
  ) : (
    <Link className={className} {...props} />
  )
}
