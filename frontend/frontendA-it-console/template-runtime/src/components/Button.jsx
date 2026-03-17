import clsx from 'clsx'
import Link from 'next/link'

function ArrowIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.5 6.5 3 3.5m0 0-3 3.5m3-3.5h-9"
      />
    </svg>
  )
}

const baseStyles =
  'inline-flex gap-0.5 justify-center items-center overflow-hidden text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'

const variantStyles = {
  primary:
    'rounded-lg bg-orange-700 py-2 px-4 text-white shadow-sm hover:bg-orange-800 active:bg-orange-900 dark:bg-orange-600 dark:hover:bg-orange-500 dark:active:bg-orange-700',
  secondary:
    'rounded-lg bg-white py-2 px-4 text-zinc-800 ring-1 ring-inset ring-zinc-300 shadow-sm hover:bg-zinc-50 active:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-700 dark:active:bg-zinc-600',
  filled:
    'rounded-lg bg-orange-700 py-2 px-4 text-white shadow-sm hover:bg-orange-800 active:bg-orange-900 dark:bg-orange-600 dark:hover:bg-orange-500 dark:active:bg-orange-700',
  destructive:
    'rounded-lg bg-red-600 py-2 px-4 text-white shadow-sm hover:bg-red-700 active:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500',
  outline:
    'rounded-lg py-2 px-4 text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white',
  ghost:
    'rounded-lg py-2 px-4 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white',
  text: 'text-orange-700 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300',
}

export function Button({
  variant = 'primary',
  className,
  children,
  arrow,
  ...props
}) {
  className = clsx(baseStyles, variantStyles[variant], className)

  let arrowIcon = (
    <ArrowIcon
      className={clsx(
        'mt-0.5 h-5 w-5',
        variant === 'text' && 'relative top-px',
        arrow === 'left' && '-ml-1 rotate-180',
        arrow === 'right' && '-mr-1',
      )}
    />
  )

  let inner = (
    <>
      {arrow === 'left' && arrowIcon}
      {children}
      {arrow === 'right' && arrowIcon}
    </>
  )

  if (typeof props.href === 'undefined') {
    return (
      <button type="button" className={className} {...props}>
        {inner}
      </button>
    )
  }

  return (
    <Link className={className} {...props}>
      {inner}
    </Link>
  )
}
