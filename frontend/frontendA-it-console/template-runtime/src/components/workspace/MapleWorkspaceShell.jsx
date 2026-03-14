'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { MapleChatDock } from './MapleChatDock'
import { MapleMascot } from './MapleMascot'
import { WelcomePanel } from './WelcomePanel'
import { WorkspaceViewHost } from './WorkspaceViewHost'
import { MAPLE_WORKSPACE_CATEGORIES } from '../../lib/maple-workspace/route-registry.js'
import {
  MAPLE_WORKSPACE_CATEGORY_VIEWS,
  buildWorkspaceHref,
  resolveWorkspaceState,
} from '../../lib/maple-workspace/workspace-state.js'

const VIEW_LABELS = Object.freeze({
  live: 'Live',
  chat: 'Chat',
  timeline: 'Timeline',
  control: 'Control',
  topology: 'Topology',
  guard: 'Guardrails',
  fork: 'Insights',
  settings: 'Settings',
  policy: 'Policy',
  marketplace: 'Marketplace',
  overview: 'Overview',
  api: 'API',
  runbooks: 'Runbooks',
  'route-help': 'Route Help',
})

function loadStylesheet(href, id) {
  if (typeof document === 'undefined') {
    return () => {}
  }

  const existing = id ? document.getElementById(id) : null
  if (existing) {
    return () => {}
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  if (id) {
    link.id = id
  }
  document.head.appendChild(link)

  return () => {
    link.remove()
  }
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
  const [contextPanelOpen, setContextPanelOpen] = useState(() => pathname !== '/maple')
  const [queuedPrompt, setQueuedPrompt] = useState('')
  const [statusText, setStatusText] = useState('Connected to Frontend B orchestration runtime stream.')

  useEffect(() => {
    const cleanupJudges = loadStylesheet('/judges.css?v=47', 'mayple-judges-css')
    const cleanupFonts = loadStylesheet(
      'https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap',
      'mayple-judges-fonts',
    )

    document.body.classList.add('product-body')
    return () => {
      document.body.classList.remove('product-body')
      cleanupJudges()
      cleanupFonts()
    }
  }, [])

  useEffect(() => {
    const explicitExecutionId = searchParams?.get('executionId')
    const explicitSessionId = searchParams?.get('sessionId')
    if (explicitExecutionId === null && explicitSessionId === null) {
      return
    }

    const nextExecutionId = explicitExecutionId ?? ''
    const nextSessionId = explicitSessionId ?? ''
    if (nextExecutionId === target.executionId && nextSessionId === target.sessionId) {
      return
    }

    setTarget({
      executionId: nextExecutionId,
      sessionId: nextSessionId,
    })
  }, [searchParams, target.executionId, target.sessionId])

  useEffect(() => {
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

    const nextHref = buildWorkspaceHref({
      category: workspaceState.category,
      view: workspaceState.view,
      routePath: workspaceState.routePath,
      executionId: workspaceState.executionId,
      sessionId: workspaceState.sessionId,
    })

    router.replace(nextHref, { scroll: false })
  }, [pathname, router, searchParams, workspaceState])

  const activeCategoryViews = useMemo(
    () => MAPLE_WORKSPACE_CATEGORY_VIEWS[activeCategory] ?? MAPLE_WORKSPACE_CATEGORY_VIEWS.observe,
    [activeCategory],
  )

  const subTabs = useMemo(
    () =>
      activeCategoryViews.map((viewId) => ({
        id: viewId,
        label: VIEW_LABELS[viewId] ?? viewId,
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
      target.executionId,
      target.sessionId,
      workspaceState.routePath,
    ],
  )

  const handleSelectCategory = (categoryId) => {
    setContextPanelOpen(true)
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

  const handleSelectView = (viewId) => {
    setContextPanelOpen(true)
    router.push(
      buildWorkspaceHref({
        category: activeCategory,
        view: viewId,
        routePath: activeRoute?.path ?? workspaceState.routePath,
        executionId: target.executionId,
        sessionId: target.sessionId,
      }),
      { scroll: false },
    )
  }

  const handleTargetChange = (nextTarget) => {
    const nextExecutionId = nextTarget?.executionId ?? ''
    const nextSessionId = nextTarget?.sessionId ?? ''

    if (nextExecutionId === target.executionId && nextSessionId === target.sessionId) {
      return
    }

    setTarget({
      executionId: nextExecutionId,
      sessionId: nextSessionId,
    })

    router.replace(
      buildWorkspaceHref({
        category: workspaceState.category,
        view: workspaceState.view,
        routePath: activeRoute?.path ?? workspaceState.routePath,
        executionId: nextExecutionId,
        sessionId: nextSessionId,
      }),
      { scroll: false },
    )
  }

  const categoryIndex = Math.max(
    MAPLE_WORKSPACE_CATEGORIES.findIndex((category) => category.id === activeCategory),
    0,
  )
  const handleRefreshContext = () => {
    setStatusText('Refreshing runtime context...')
    window.setTimeout(() => {
      setStatusText('Connected to Frontend B orchestration runtime stream.')
    }, 900)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    } catch {
      // Best-effort logout in frontend-only mode.
    } finally {
      router.push('/login')
    }
  }

  return (
    <section className="mayple-shell-root" data-testid="maple-workspace-layout">
      <div className="product-shell" data-testid="maple-workspace-shell">
        <header className={`top-bar ${contextPanelOpen ? 'panel-connected' : ''}`}>
          <div className="top-bar-brand">
            <MapleMascot className="kirby-mascot top-bar-kirby" gradientId="kirbyBodyGrad-brand" />
            <span className="top-bar-title">Mayple</span>
            <span className="chat-mode-badge rules">Rules</span>
            <span className="mw-source-badge">Source: Frontend B orchestration runtime</span>
          </div>
          <div className="top-bar-end">
            <button
              id="firewallChatRefreshBtn"
              className="top-bar-icon-btn"
              type="button"
              title="Refresh Context"
              aria-label="Refresh Context"
              onClick={handleRefreshContext}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13.5 8a5.5 5.5 0 01-10.58 2.12M2.5 8a5.5 5.5 0 0110.58-2.12M13.5 3v3.5H10M2.5 13V9.5H6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              id="logoutBtn"
              className="top-bar-icon-btn"
              type="button"
              title="Sign Out"
              aria-label="Sign Out"
              onClick={handleLogout}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className="main-area">
          <div id="status" className="status" role="status" aria-live="polite">
            <span id="pollDot" className="poll-dot live" />
            <span id="pollState">{statusText}</span>
          </div>

          <div className={`chat-home ${contextPanelOpen ? 'panel-active' : ''}`} id="chatHome">
            <WelcomePanel
              routeTitle={activeRoute?.title}
              executionId={target.executionId}
              isHidden={contextPanelOpen}
              onSelectPrompt={setQueuedPrompt}
            />

            <MapleChatDock
              routeRecord={activeRoute}
              panelOpen={contextPanelOpen}
              presetPrompt={queuedPrompt}
              onPresetPromptHandled={() => setQueuedPrompt('')}
            />

            <div className={`context-panel ${contextPanelOpen ? 'is-open' : ''}`} id="contextPanel" aria-hidden={!contextPanelOpen}>
              <button
                id="contextCloseBtn"
                className="context-close-btn"
                type="button"
                aria-label="Close context panel"
                onClick={() => setContextPanelOpen(false)}
              >
                Close
              </button>

              <div className="context-panel-body" id="contextPanelBody">
                <WorkspaceViewHost
                  category={activeCategory}
                  view={activeView}
                  routeRecord={activeRoute}
                  executionId={target.executionId}
                  sessionId={target.sessionId}
                  onTargetChange={handleTargetChange}
                />
              </div>

              <div className="context-panel-foot" id="contextSubRow">
                <div className="context-sub-tabs" id="contextSubTabs" role="tablist" aria-label="Category views">
                  {subTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      className={`context-sub-tab ${tab.id === activeView ? 'is-active' : ''}`}
                      aria-selected={tab.id === activeView}
                      onClick={() => handleSelectView(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <nav className="category-bar" role="navigation" aria-label="Workspace categories">
              <div className="category-track">
                <div
                  className="category-indicator is-active"
                  style={{
                    width: `${100 / MAPLE_WORKSPACE_CATEGORIES.length}%`,
                    transform: `translateX(${categoryIndex * 100}%)`,
                  }}
                />
                {MAPLE_WORKSPACE_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    className={`category-pill ${category.id === activeCategory ? 'is-active' : ''}`}
                    data-category={category.id}
                    type="button"
                    role="tab"
                    aria-selected={category.id === activeCategory}
                    aria-controls="contextPanel"
                    onClick={() => handleSelectCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </section>
  )
}
