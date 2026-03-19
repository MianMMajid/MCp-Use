<script>
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'

  import ChatView from './ChatView.svelte'
  import AgentManagementSurface from './AgentManagementSurface.svelte'
  import DocsViews from './DocsViews.svelte'
  import MapleBottomSettings from './MapleBottomSettings.svelte'
  import MapleTopBar from './MapleTopBar.svelte'
  import GatewaySurface from './GatewaySurface.svelte'
  import HitlQueueSurface from './HitlQueueSurface.svelte'
  import InterventionsSurface from './InterventionsSurface.svelte'
  import MapleCategoryPills from './MapleCategoryPills.svelte'
  import MapleRoutePage from './MapleRoutePage.svelte'
  import MapleViewTabs from './MapleViewTabs.svelte'
  import ModifierApprovalsSurface from './ModifierApprovalsSurface.svelte'
  import PolicyCenterSurface from './PolicyCenterSurface.svelte'
  import RunsSurface from './RunsSurface.svelte'
  import WorkflowStudioSurface from './WorkflowStudioSurface.svelte'
  import {
    getClosestMapleRoute,
    getMapleDockGroupForPath,
    getMapleRoutesByDockGroup,
    MAPLE_DOCK_GROUPS,
  } from '../maple-workspace/route-registry.js'
  import {
    canAccessCategory,
    loadPermissions,
    markPermissionLoadFailed,
    onPermissionChange,
    permissionsReady,
  } from '../maple-workspace/permissions.js'

  let authMe = null
  let permReady = permissionsReady()
  let permissionVersion = 0
  let offline = false

  const CATEGORY_LABEL_BY_GROUP = Object.freeze({
    chat: 'Investigate',
    monitor: 'Observe',
    firewalls: 'Protect',
    agents: 'Govern',
  })

  $: routeRecord = getClosestMapleRoute($page.url.pathname)
  $: currentPath = $page.url.pathname
  $: activeGroup = getMapleDockGroupForPath(currentPath)
  $: exactSurfaceRoute = Boolean(routeRecord && routeRecord.path === currentPath && ['primary', 'secondary', 'utility'].includes(routeRecord.navTier))
  $: sectionRoutes = activeGroup ? getMapleRoutesByDockGroup(activeGroup) : []
  $: visibleCategories = (permissionVersion, MAPLE_DOCK_GROUPS.filter((item) => {
    if (authMe) return true
    if (item.id === 'chat') return canAccessCategory('chat')
    if (item.id === 'monitor') return canAccessCategory('observe')
    if (item.id === 'firewalls') return canAccessCategory('firewalls')
    if (item.id === 'agents') return canAccessCategory('admin')
    return true
  }).map((item) => ({ id: item.id, label: item.label, href: item.primaryHref })))
  $: categoryHrefById = Object.fromEntries(visibleCategories.map((category) => [category.id, category.href]))
  $: viewIds = sectionRoutes.map((route) => route.path)
  $: viewLabels = Object.fromEntries(sectionRoutes.map((route) => [route.path, route.title]))
  $: viewHrefById = Object.fromEntries(sectionRoutes.map((route) => [route.path, route.path]))
  $: activeCategoryLabel = routeRecord?.navTier === 'utility'
    ? 'Utilities'
    : CATEGORY_LABEL_BY_GROUP[activeGroup] ?? routeRecord?.title ?? 'Control Plane'
  $: sourceText = routeRecord
    ? `Maple operator console · ${routeRecord.title}`
    : 'Maple operator console · live control plane'
  $: isChatRoute = currentPath === '/maple/chat'

  onMount(() => {
    let cancelled = false
    const unsubscribe = onPermissionChange(() => {
      permissionVersion += 1
      permReady = permissionsReady()
    })

    function onConnectivity(event) {
      const isOnline = Boolean(event.detail?.online)
      offline = !isOnline
      if (isOnline) {
        window.dispatchEvent(new CustomEvent('maple:shell-refresh'))
      }
    }
    document.addEventListener('maple:connectivity', onConnectivity)

    if (!permReady) {
      loadPermissions()
      const timeoutId = setTimeout(() => {
        if (!permissionsReady()) {
          markPermissionLoadFailed()
          permReady = true
        }
      }, 10_000)
      void loadAuthMe()

      return () => {
        cancelled = true
        clearTimeout(timeoutId)
        unsubscribe()
        document.removeEventListener('maple:connectivity', onConnectivity)
      }
    }

    void loadAuthMe()
    return () => {
      cancelled = true
      unsubscribe()
      document.removeEventListener('maple:connectivity', onConnectivity)
    }

    async function loadAuthMe() {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
        if (!response.ok || cancelled) return
        const payload = await response.json()
        if (!cancelled) authMe = payload?.user ?? null
      } catch {
        authMe = null
      }
    }
  })

  async function refreshWorkspace() {
    window.dispatchEvent(new CustomEvent('maple:shell-refresh'))
    await invalidateAll()
  }

  function renderProductSurface(path) {
    return exactSurfaceRoute && path === currentPath
  }
</script>

{#if !permReady}
  <section class="workspace product-body" data-testid="maple-workspace-loading">
    <div class="product-shell shell" style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
      <p style="opacity:0.6;">Loading workspace&hellip;</p>
    </div>
  </section>
{:else}
  <section class="workspace product-body mayple-shell-root" data-testid="maple-workspace-layout">
    <div class="product-shell shell" data-testid="maple-workspace-shell">
      <MapleTopBar
        title="Mayple"
        {sourceText}
        connected={!offline}
        {authMe}
        currentRouteTitle={routeRecord?.title ?? 'Control Plane'}
        {activeCategoryLabel}
        on:refresh={refreshWorkspace}
      />

      <div class="main-area">
        <div class:chat-home={isChatRoute} class:surface-home={!isChatRoute}>
          {#if isChatRoute}
            <div class="chat-full-panel">
              <ChatView
                {authMe}
                executionId=""
                sessionId=""
                routeTitle={routeRecord?.title ?? ''}
              />
            </div>
          {:else}
            <div class="context-panel is-open">
              {#key currentPath}
                <div class="context-panel-body">
                  {#if renderProductSurface('/maple/observability')}
                    <MapleRoutePage routePath="/maple/observability" embedded={true} />
                  {:else if renderProductSurface('/maple/topology')}
                    <MapleRoutePage routePath="/maple/topology" embedded={true} />
                  {:else if renderProductSurface('/maple/forks')}
                    <MapleRoutePage routePath="/maple/forks" embedded={true} />
                  {:else if renderProductSurface('/maple/runs')}
                    <RunsSurface />
                  {:else if renderProductSurface('/maple/gateway')}
                    <GatewaySurface />
                  {:else if renderProductSurface('/maple/interventions')}
                    <InterventionsSurface />
                  {:else if renderProductSurface('/maple/cyber')}
                    <MapleRoutePage routePath="/maple/cyber" embedded={true} />
                  {:else if renderProductSurface('/maple/policies')}
                    <PolicyCenterSurface />
                  {:else if renderProductSurface('/maple/agent')}
                    <AgentManagementSurface />
                  {:else if renderProductSurface('/maple/hitl')}
                    <HitlQueueSurface />
                  {:else if renderProductSurface('/maple/modifier-approvals')}
                    <ModifierApprovalsSurface />
                  {:else if renderProductSurface('/maple/demo')}
                    <WorkflowStudioSurface />
                  {:else if renderProductSurface('/maple/docs')}
                    <DocsViews view="overview" routePath="/maple/docs" endpoints={[]} />
                  {:else}
                    <slot />
                  {/if}
                </div>
              {/key}
            </div>
          {/if}

          {#if offline}
            <div class="offline-banner" role="status" aria-live="polite">
              You are offline. Data may be stale.
            </div>
          {/if}

          <div class="bottom-unified-strip">
            {#if exactSurfaceRoute && viewIds.length > 1}
              <div class="strip-sub-tabs">
                <MapleViewTabs
                  views={viewIds}
                  activeView={currentPath}
                  labels={viewLabels}
                  hrefByView={viewHrefById}
                />
              </div>
            {/if}
            <div class="strip-categories">
              <MapleCategoryPills
                categories={visibleCategories}
                activeCategory={activeGroup ?? ''}
                hrefByCategory={categoryHrefById}
              >
                <MapleBottomSettings {authMe} on:refresh={refreshWorkspace} />
              </MapleCategoryPills>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .surface-home {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bottom-unified-strip {
    flex-shrink: 0;
    background: var(--panel);
    backdrop-filter: blur(20px) saturate(180%);
  }

  .strip-sub-tabs {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8px 16px;
    min-height: 44px;
    border-top: 1px solid var(--line);
  }

  .strip-categories {
    display: flex;
    justify-content: center;
    padding: 0 16px 8px;
  }

  .offline-banner {
    flex-shrink: 0;
    text-align: center;
    padding: 6px 16px;
    font-size: 0.8125rem;
    font-weight: 500;
    background: var(--warn-soft);
    color: var(--warn);
    border-top: 1px solid var(--warn-border);
  }

  :global(.mayple-shell-root .product-shell) {
    grid-template-rows: minmax(0, 1fr);
  }
 </style>
