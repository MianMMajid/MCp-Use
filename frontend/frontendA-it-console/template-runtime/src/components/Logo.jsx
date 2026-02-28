import clsx from 'clsx'

export function Logo({ className, ...props }) {
  return (
    <div {...props} className={clsx('flex items-center gap-2', className)}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-semibold text-white">
        M
      </span>
      <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Mayple
      </span>
    </div>
  )
}
