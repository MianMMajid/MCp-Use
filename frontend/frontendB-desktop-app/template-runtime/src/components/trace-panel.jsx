'use client'

import { useChat } from '@/contexts/chat-context'
import { ExecutionTrace } from './agent-workspace/execution-trace'
import { DelegationTree } from './agent-workspace/delegation-tree'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'

export function TracePanel() {
  const { traceOpen, toggleTrace, events, runs, currentRunId } = useChat()

  return (
    <AnimatePresence>
      {traceOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex h-full w-[340px] flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Execution Trace
              </h3>
              <button
                onClick={toggleTrace}
                className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <XMarkIcon className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <ExecutionTrace events={events} currentRunId={currentRunId} />
            </div>
            <DelegationTree runs={runs} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
