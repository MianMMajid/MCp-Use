'use client'

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'

export function TabBar({ tabs, children, defaultIndex = 0, onChange }) {
  return (
    <TabGroup defaultIndex={defaultIndex} onChange={onChange}>
      <TabList className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {tabs.map((tab) => (
          <Tab
            key={tab}
            className={({ selected }) =>
              clsx(
                'px-3 py-2 text-sm font-medium outline-none transition',
                selected
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              )
            }
          >
            {tab}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="mt-4">
        {children}
      </TabPanels>
    </TabGroup>
  )
}

export { Tab, TabPanel, TabPanels }
