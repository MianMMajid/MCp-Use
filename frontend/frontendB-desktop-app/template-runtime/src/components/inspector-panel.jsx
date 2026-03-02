'use client'

import { useShell } from '@/contexts/shell-context'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'

function renderValue(value) {
  if (value === null || value === undefined) return <span className="text-zinc-400">null</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-green-600' : 'text-red-600'}>{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
  if (typeof value === 'string') return value
  return <pre className="max-h-40 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">{JSON.stringify(value, null, 2)}</pre>
}

export function InspectorPanel() {
  const { inspectorOpen, inspectorData, closeInspector } = useShell()

  return (
    <AnimatePresence>
      {inspectorOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 384, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex h-full w-96 flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {inspectorData?.title ?? 'Details'}
              </h3>
              <button onClick={closeInspector} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <XMarkIcon className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {inspectorData?.summary && (
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{inspectorData.summary}</p>
              )}
              {inspectorData?.fields && (
                <DescriptionList>
                  {Object.entries(inspectorData.fields).map(([key, value]) => (
                    <div key={key}>
                      <DescriptionTerm>{key}</DescriptionTerm>
                      <DescriptionDetails>{renderValue(value)}</DescriptionDetails>
                    </div>
                  ))}
                </DescriptionList>
              )}
              {inspectorData?.json && (
                <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {JSON.stringify(inspectorData.json, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
