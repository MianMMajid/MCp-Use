import clsx from 'clsx'

export function Logo({ className, ...props }) {
  return (
    <div
      {...props}
      className={clsx('inline-flex items-center gap-2', className)}
      aria-label="Mayple"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 font-display text-lg font-semibold text-white">
        M
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-slate-900">
        Mayple
      </span>
    </div>
  )
}
