'use client'

import { useRouter } from 'next/navigation'
import { useChat } from '@/contexts/chat-context'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Field, Label, Description } from '@/components/fieldset'
import { statusColor, riskColor, riskLabel } from '@/lib/format'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'

export function NodeConfigPanel({ node, edges, nodes, onClose, onRemoveNode }) {
  const router = useRouter()
  const { selectAgent } = useChat()

  if (!node) return null

  const agent = node.data?.agent
  const agentId = node.data?.agentId
  const name = agent?.name ?? agentId?.substring(0, 12) ?? 'Unknown'
  const status = agent?.status ?? 'unknown'
  const riskTier = agent?.riskTier ?? agent?.riskScore
  const description = agent?.description ?? ''
  const capabilities = agent?.capabilities ?? []

  // Find connected edges
  const incomingEdges = edges.filter((e) => e.target === node.id)
  const outgoingEdges = edges.filter((e) => e.source === node.id)

  const getNodeName = (nodeId) => {
    const n = nodes.find((nd) => nd.id === nodeId)
    return n?.data?.agent?.name ?? n?.data?.agentId?.substring(0, 8) ?? 'Unknown'
  }

  const handleChatWithAgent = () => {
    selectAgent(agentId)
    router.push('/')
  }

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 384, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="shrink-0 overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex h-full w-96 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {name}
            </h3>
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <XMarkIcon className="h-4 w-4 text-zinc-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Agent Details */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Agent Details
              </h4>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Status:</span>
                  <Badge color={statusColor(status)} className="text-[10px]">{status}</Badge>
                </div>
                {riskTier != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Risk tier:</span>
                    <Badge color={riskColor(riskTier)} className="text-[10px]">{riskLabel(riskTier)}</Badge>
                  </div>
                )}
                {description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
                )}
              </div>
            </section>

            {/* Capabilities */}
            {capabilities.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Capabilities
                </h4>
                <div className="mt-2 flex flex-wrap gap-1">
                  {capabilities.map((cap) => (
                    <Badge key={cap} color="zinc" className="text-[10px]">{cap}</Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Connections */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Connections
              </h4>
              <div className="mt-2 space-y-1.5">
                {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
                  <p className="text-xs text-zinc-400">No connections</p>
                )}
                {incomingEdges.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-400">&larr;</span>
                    <span>From: {getNodeName(e.source)}</span>
                  </div>
                ))}
                {outgoingEdges.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-400">&rarr;</span>
                    <span>To: {getNodeName(e.target)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Actions */}
          <div className="border-t border-zinc-200 p-4 space-y-2 dark:border-zinc-800">
            <Button color="orange" className="w-full" onClick={handleChatWithAgent}>
              Chat with Agent
            </Button>
            <Button
              outline
              className="w-full text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => onRemoveNode(node.id)}
            >
              Remove from Canvas
            </Button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
