import { Badge } from '@/components/badge'

export function StatCard({ title, value, subtitle, badge, badgeColor }) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{value}</p>
        {badge && <Badge color={badgeColor ?? 'zinc'}>{badge}</Badge>}
      </div>
      {subtitle && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
    </div>
  )
}
