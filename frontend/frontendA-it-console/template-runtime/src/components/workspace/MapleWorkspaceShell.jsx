'use client'

import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { MapleCategoryRail } from './MapleCategoryRail'
import { MapleChatDock } from './MapleChatDock'
import { MapleContextFrame } from './MapleContextFrame'
import { MapleDocsPanel } from './MapleDocsPanel'
import { MapleTopBar } from './MapleTopBar'
import { MapleViewTabs } from './MapleViewTabs'
import { WorkspaceViewHost } from './WorkspaceViewHost'
import {
  MAPLE_WORKSPACE_CATEGORIES,
} from '../../lib/maple-workspace/route-registry.js'
import {
  MAPLE_DOCS_PANEL_STORAGE_KEY,
  parseStoredDocsPanelPreference,
  resolveInitialDocsPanelState,
} from '../../lib/maple-workspace/docs-panel-preferences.js'
import {
  MAPLE_WORKSPACE_CATEGORY_VIEWS,
  buildWorkspaceHref,
  isMapleWorkspacePath,
  resolveWorkspaceState,
} from '../../lib/maple-workspace/workspace-state.js'

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'
const VIEW_LABELS = Object.freeze({
  live: 'Live',
  timeline: 'Timeline',
  control: 'Control',
  topology: 'Topology',
  guard: 'Guardrails',
  fork: 'Fork Insights',
  settings: 'Settings',
  policy: 'Policy',
  marketplace: 'Marketplace',
  overview: 'Overview',
  api: 'API',
  runbooks: 'Runbooks',
  'route-help': 'Route Help',
})

function persistDocsPreference(nextValue) {
  if (typeof window === 'undefined') {
    return
  }
  const storedValue = nextValue ? 'open' : 'closed'
  window.localStorage.setItem(MAPLE_DOCS_PANEL_STORAGE_KEY, storedValue)
}

export function MapleWorkspaceShell() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const workspaceState = useMemo(
    () => resolveWorkspaceState({ pathname, searchParams }),
    [pathname, searchParams],
  )
  const activeRoute = workspaceState.routeRecord
  const activeCategory = workspaceState.category
  const activeView = workspaceState.view
  const [target, setTarget] = useState({
    executionId: workspaceState.executionId,
    sessionId: workspaceState.sessionId,
  })
  const [isDesktop, setIsDesktop] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)

  useEffect(() => {
    setTarget({
      executionId: workspaceState.executionId,
      sessionId: workspaceState.sessionId,
    })
  }, [workspaceState.executionId, workspaceState.sessionId])

  useEffect(() => {
    if (!isMapleWorkspacePath(pathname)) {
      return
    }

    const needsCanonicalPath = workspaceState.normalizedPathname !== '/maple'
    const currentCategory = searchParams?.get('category')
    const currentView = searchParams?.get('view')
    const currentRoute = searchParams?.get('route')
    const currentExecutionId = searchParams?.get('executionId') ?? ''
    const currentSessionId = searchParams?.get('sessionId') ?? ''

    const needsCanonicalQuery =
      currentCategory !== workspaceState.category ||
      currentView !== workspaceState.view ||
      currentRoute !== workspaceState.routePath ||
      currentExecutionId !== workspaceState.executionId ||
      currentSessionId !== workspaceState.sessionId

    if (!needsCanonicalPath && !needsCanonicalQuery) {
      return
    }

    router.replace(
      buildWorkspaceHref({
        category: workspaceState.category,
        view: workspaceState.view,
        routePath: workspaceState.routePath,
        executionId: workspaceState.executionId,
        sessionId: workspaceState.sessionId,
      }),
      { scroll: false },
    )
  }, [pathname, router, searchParams, workspaceState])

  useEffect(() => {
    if (!isMapleWorkspacePath(pathname)) {
      return
    }
    if (
      target.executionId === workspaceState.executionId &&
      target.sessionId === workspaceState.sessionId
    ) {
      return
    }

    router.replace(
      buildWorkspaceHref({
        category: workspaceState.category,
        view: workspaceState.view,
        routePath: workspaceState.routePath,
        executionId: target.executionId,
        sessionId: target.sessionId,
      }),
      { scroll: false },
    )
  }, [
    pathname,
    router,
    target.executionId,
    target.sessionId,
    workspaceState.category,
    workspaceState.executionId,
    workspaceState.routePath,
    workspaceState.sessionId,
    workspaceState.view,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const media = window.matchMedia(DESKTOP_MEDIA_QUERY)

    const applyState = () => {
      const preference = parseStoredDocsPanelPreference(
        window.localStorage.getItem(MAPLE_DOCS_PANEL_STORAGE_KEY),
      )
      const desktop = media.matches
      setIsDesktop(desktop)
      setDocsOpen(
        resolveInitialDocsPanelState({
          storedPreference: preference,
          isDesktop: desktop,
        }),
      )
    }

    const handleMediaChange = () => {
      setIsDesktop(media.matches)
      const preference = parseStoredDocsPanelPreference(
        window.localStorage.getItem(MAPLE_DOCS_PANEL_STORAGE_KEY),
      )
      if (typeof preference !== 'boolean') {
        setDocsOpen(media.matches)
      }
    }

    applyState()
    media.addEventListener('change', handleMediaChange)

    return () => {
      media.removeEventListener('change', handleMediaChange)
    }
  }, [])

  const activeCategoryViews = useMemo(
    () => MAPLE_WORKSPACE_CATEGORY_VIEWS[activeCategory] ?? MAPLE_WORKSPACE_CATEGORY_VIEWS.observe,
    [activeCategory],
  )
  const activeCategoryLabel = useMemo(
    () => MAPLE_WORKSPACE_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Observe',
    [activeCategory],
  )
  const activeViewLabel = VIEW_LABELS[activeView] ?? activeView
  const tabs = useMemo(
    () =>
      activeCategoryViews.map((viewId) => ({
        id: viewId,
        label: VIEW_LABELS[viewId] ?? viewId,
        caption: activeCategory === 'docs' ? 'Documentation' : activeRoute?.title ?? 'Operations',
        href: buildWorkspaceHref({
          category: activeCategory,
          view: viewId,
          routePath: activeRoute?.path ?? workspaceState.routePath,
          executionId: target.executionId,
          sessionId: target.sessionId,
        }),
      })),
    [
      activeCategory,
      activeCategoryViews,
      activeRoute?.path,
      activeRoute?.title,
      target.executionId,
      target.sessionId,
      workspaceState.routePath,
    ],
  )

  const toggleDocs = () => {
    setDocsOpen((prev) => {
      const next = !prev
      persistDocsPreference(next)
      return next
    })
  }

  const closeDocs = () => {
    setDocsOpen(false)
    persistDocsPreference(false)
  }
  const handleSelectCategory = (categoryId) => {
    router.push(
      buildWorkspaceHref({
        category: categoryId,
        view: MAPLE_WORKSPACE_CATEGORY_VIEWS[categoryId]?.[0] ?? 'live',
        routePath: activeRoute?.path ?? workspaceState.routePath,
        executionId: target.executionId,
        sessionId: target.sessionId,
      }),
      { scroll: false },
    )
  }

  const handleTargetChange = (nextTarget) => {
    setTarget({
      executionId: nextTarget?.executionId ?? '',
      sessionId: nextTarget?.sessionId ?? '',
    })
  }

  return (
    <section
      className={clsx('mw-shell', docsOpen && 'mw-docs-open', !isDesktop && 'mw-mobile-shell')}
      data-testid="maple-workspace-layout"
    >
      <MapleTopBar
        activeRoute={activeRoute}
        activeCategoryLabel={activeCategoryLabel}
        activeViewLabel={activeViewLabel}
        docsOpen={docsOpen}
        onToggleDocs={toggleDocs}
      />

      <div className="mw-main-grid">
        <aside className="mw-navigation-column">
          <MapleCategoryRail
            categories={MAPLE_WORKSPACE_CATEGORIES}
            activeCategory={activeCategory}
            onSelectCategory={handleSelectCategory}
          />
          <MapleViewTabs tabs={tabs} activeTabId={activeView} />
        </aside>

        <MapleContextFrame>
          <WorkspaceViewHost
            category={activeCategory}
            view={activeView}
            routeRecord={activeRoute}
            executionId={target.executionId}
            sessionId={target.sessionId}
            onTargetChange={handleTargetChange}
          />
        </MapleContextFrame>

        <MapleDocsPanel
          isDesktop={isDesktop}
          isOpen={docsOpen}
          routeRecord={activeRoute}
          onClose={closeDocs}
        />
      </div>

      <MapleChatDock
        routeRecord={activeRoute}
        executionId={target.executionId}
        sessionId={target.sessionId}
      />
    </section>
  )
}
