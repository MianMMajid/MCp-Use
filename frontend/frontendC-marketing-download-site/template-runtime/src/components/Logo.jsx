import clsx from 'clsx'

export function Logo({ className, ...props }) {
  return (
    <div
      {...props}
      className={clsx('inline-flex items-center gap-2', className)}
      aria-label="Mayple"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-semibold text-white">
        M
      </span>
      <span className="text-base font-semibold tracking-tight text-zinc-900">
        Mayple
      </span>
    </div>
  )
}
