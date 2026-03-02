import { Badge } from '@/components/badge'
import { RiskBadge } from '@/components/risk-badge'
import { Link } from '@/components/link'
import { statusColor, formatDate } from '@/lib/format'

export function AgentCard({ agent, selected, onClick }) {
  return (
    <div
      onClick={() => onClick?.(agent)}
      className={`cursor-pointer rounded-lg border p-3 transition ${
        selected
          ? 'border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-800'
          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</p>
        <RiskBadge tier={agent.riskTier} />
      </div>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
        {agent.description || 'No description'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Badge color={statusColor(agent.status)}>{agent.status}</Badge>
        {agent.updatedAt && (
          <span className="text-xs text-zinc-400">{formatDate(agent.updatedAt)}</span>
        )}
      </div>
    </div>
  )
}
