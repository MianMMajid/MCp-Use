import clsx from 'clsx'
import { MaypleCharacter } from '@/components/MaypleCharacter'

export function Logo({ className, ...props }) {
  return (
    <div
      {...props}
      className={clsx('inline-flex items-center gap-2', className)}
      aria-label="Mayple"
    >
      <MaypleCharacter size={40} />
      <span className="text-lg font-semibold tracking-tight text-zinc-900">
        Mayple
      </span>
    </div>
  )
}
