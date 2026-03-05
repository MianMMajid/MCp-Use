'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ObjectiveConsole } from '@/components/orchestration/objective-console'
import { RuntimeCommandBar } from '@/components/orchestration/runtime-command-bar'
import { TimedTaskPanel } from '@/components/orchestration/timed-task-panel'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid'

const TABS = {
  objective: 'Objective',
  runtime: 'Runtime',
  tasks: 'Tasks',
}

export function OrchestrationDesignerDock({
  objectiveEnabled,
  objectiveProps,
  runtimeProps,
  tasksProps,
}) {
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState(objectiveEnabled ? 'objective' : 'runtime')

  return (
    <section className="border-t border-zinc-200/80 bg-[var(--mayple-surface)] dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Designer Dock</p>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {(objectiveEnabled ? ['objective', 'runtime', 'tasks'] : ['runtime', 'tasks']).map((entry) => (
            <button
              key={entry}
              onClick={() => setTab(entry)}
              className={clsx(
                'rounded-md px-2 py-1 text-xs transition',
                tab === entry
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
              )}
            >
              {TABS[entry]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="ml-auto rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          title={expanded ? 'Collapse dock' : 'Expand dock'}
        >
          {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
        </button>
      </div>

      {expanded ? (
        <>
          {tab === 'objective' && objectiveEnabled ? <ObjectiveConsole {...objectiveProps} /> : null}
          {tab === 'runtime' ? <RuntimeCommandBar {...runtimeProps} /> : null}
          {tab === 'tasks' ? <TimedTaskPanel {...tasksProps} /> : null}
        </>
      ) : null}
    </section>
  )
}
