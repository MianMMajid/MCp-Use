import clsx from 'clsx'

export function Logo({ className, ...props }) {
  return (
    <div {...props} className={clsx('flex items-center gap-2', className)}>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 text-xs font-bold text-white">
        M
      </span>
      <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Mayple
      </span>
    </div>
  )
}
