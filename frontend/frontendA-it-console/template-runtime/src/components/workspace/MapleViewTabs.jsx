'use client'

import clsx from 'clsx'
import Link from 'next/link'

export function MapleViewTabs({ tabs, activeTabId }) {
  return (
    <nav className="mw-view-tabs" role="tablist" aria-label="Mayple workspace tabs">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={clsx('mw-view-tab', isActive && 'mw-view-tab-active')}
            role="tab"
            aria-selected={isActive}
            data-active={isActive ? 'true' : 'false'}
          >
            <span className="mw-view-tab-label">{tab.label}</span>
            <span className="mw-view-tab-caption">{tab.caption}</span>
          </Link>
        )
      })}
    </nav>
  )
}
