'use client'

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

function policyLabel(policy) {
  if (!policy) return 'Open'
  if (policy.requiresApproval) return 'Approval Required'
  if (policy.riskCeiling && policy.riskCeiling !== 'critical') return `Max: ${policy.riskCeiling}`
  return 'Open'
}

export const DelegationEdge = memo(function DelegationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const label = policyLabel(data?.delegationPolicy)

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#f97316' : '#a1a1aa',
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`
            rounded-md border px-1.5 py-0.5 text-[10px] font-medium
            ${selected
              ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'
              : 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
            }
          `}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
