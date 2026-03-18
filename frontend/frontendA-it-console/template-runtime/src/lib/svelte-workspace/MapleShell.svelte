<script>
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'

  import ChatView from './ChatView.svelte'
  import AgentManagementSurface from './AgentManagementSurface.svelte'
  import MapleBottomSettings from './MapleBottomSettings.svelte'
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

  const CATEGORY_LABEL_BY_GROUP = Object.freeze({
    chat: 'Investigate',
    monitor: 'Observe',
    firewalls: 'Protect',
    agents: 'Govern',
  })

  $: routeRecord = getClosestMapleRoute($page.url.pathname)
  $: currentPath = $page.url.pathname
  $: activeGroup = getMapleDockGroupForPath(currentPath)
  $: exactSurfaceRoute = Boolean(routeRecord && routeRecord.path === currentPath && ['primary', 'secondary'].includes(routeRecord.navTier))
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
      }
    }

    void loadAuthMe()
    return () => {
      cancelled = true
      unsubscribe()
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
                  {:else}
                    <slot />
                  {/if}
                </div>
              {/key}
            </div>
          {/if}

          <div class="bottom-nav-stack">
            {#if exactSurfaceRoute && viewIds.length > 1}
              <MapleViewTabs
                views={viewIds}
                activeView={currentPath}
                labels={viewLabels}
                hrefByView={viewHrefById}
              />
            {/if}

            <div class="bottom-dock-row">
              <MapleCategoryPills
                categories={visibleCategories}
                activeCategory={activeGroup ?? ''}
                hrefByCategory={categoryHrefById}
              />
              <MapleBottomSettings {authMe} on:refresh={refreshWorkspace} />
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
    padding-bottom: 72px;
  }

  .bottom-dock-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.mayple-shell-root .product-shell) {
    grid-template-rows: minmax(0, 1fr);
  }
 </style>
