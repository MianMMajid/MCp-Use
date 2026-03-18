<script>
  import { page } from '$app/stores'

  import MapleCategoryPills from './MapleCategoryPills.svelte'
  import MapleTopBar from './MapleTopBar.svelte'
  import MapleViewTabs from './MapleViewTabs.svelte'
  import FakeDataControl from './FakeDataControl.svelte'

  import {
    MAPLE_WORKSPACE_CATEGORIES,
    getClosestMapleRoute,
    getMaplePrimaryRouteForCategory,
    getMapleRoutesByCategory,
  } from '../maple-workspace/route-registry.js'

  $: routeRecord = getClosestMapleRoute($page.url.pathname)
  $: activeCategory = routeRecord?.category ?? 'observe'
  $: categoryHrefById = Object.fromEntries(
    MAPLE_WORKSPACE_CATEGORIES.map((category) => [
      category.id,
      category.id === 'docs'
        ? '/quickstart'
        : (getMaplePrimaryRouteForCategory(category.id)?.path ?? '/maple/observability'),
    ]),
  )
  $: categoryRoutes = getMapleRoutesByCategory(activeCategory)
  $: tabRoutes = categoryRoutes.map((route) => route.path)
  $: tabLabels = Object.fromEntries(categoryRoutes.map((route) => [route.path, route.tabLabel]))
  $: tabHrefByView = Object.fromEntries(categoryRoutes.map((route) => [route.path, route.path]))
  $: sourceText = routeRecord
    ? `Security Console · ${routeRecord.title}`
    : 'Security Console · Maple'
</script>

<section class="workspace product-body" data-testid="maple-workspace-layout">
  <div class="product-shell shell" data-testid="maple-workspace-shell">
    <MapleTopBar title="Mayple" {sourceText} connected={true} />

    <div class="main-area">
      <div class="context-panel is-open" aria-hidden={false}>
        <div class="context-panel-body">
          <div class="view-panel panel">
            <slot />
          </div>
        </div>
        <div class="context-panel-foot">
          <MapleViewTabs
            views={tabRoutes}
            activeView={routeRecord?.path ?? ''}
            labels={tabLabels}
            hrefByView={tabHrefByView}
          />
        </div>
      </div>

      <MapleCategoryPills
        categories={MAPLE_WORKSPACE_CATEGORIES}
        activeCategory={activeCategory}
        hrefByCategory={categoryHrefById}
      />

      <div class="chat-composer-placeholder" aria-hidden="true"></div>
      <FakeDataControl />
    </div>
  </div>
</section>
