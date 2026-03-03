'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Badge } from '@/components/badge'
import { statusColor, riskColor, riskLabel } from '@/lib/format'
import { CpuChipIcon } from '@heroicons/react/20/solid'

export const AgentNode = memo(function AgentNode({ data, selected }) {
  const agent = data?.agent
  const name = agent?.name ?? data?.agentId?.substring(0, 12) ?? 'Unknown'
  const status = agent?.status ?? 'unknown'
  const riskTier = agent?.riskTier ?? agent?.riskScore
  const capabilities = agent?.capabilities ?? []

  return (
    <div
      className={`
        w-56 rounded-xl border bg-white shadow-sm transition-all
        dark:bg-zinc-900
        ${selected
          ? 'border-orange-500 ring-2 ring-orange-500/20'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
        }
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-white !bg-zinc-400 dark:!border-zinc-900 dark:!bg-zinc-500"
      />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <CpuChipIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium text-zinc-900 dark:text-white">
                {name}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  status === 'active' ? 'bg-green-500' : 'bg-zinc-400'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Badges row */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {riskTier != null && (
            <Badge color={riskColor(riskTier)} className="text-[9px]">
              {riskLabel(riskTier)}
            </Badge>
          )}
          {capabilities.slice(0, 2).map((cap) => (
            <Badge key={cap} color="zinc" className="text-[9px]">
              {cap}
            </Badge>
          ))}
          {capabilities.length > 2 && (
            <span className="text-[9px] text-zinc-400">+{capabilities.length - 2}</span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-white !bg-zinc-400 dark:!border-zinc-900 dark:!bg-zinc-500"
      />
    </div>
  )
})
