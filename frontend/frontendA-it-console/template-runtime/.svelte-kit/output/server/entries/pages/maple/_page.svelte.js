import "clsx";
import { g as getContext, c as attr_class, b as bind_props, d as attr_style, e as ensure_array_like, f as stringify, h as store_get, u as unsubscribe_stores } from "../../../chunks/index2.js";
import { f as fallback, e as escape_html, a as attr } from "../../../chunks/attributes.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
import { d as docsByPath } from "../../../chunks/content.js";
import { r as resolveWorkspaceState, M as MAPLE_ROUTE_REGISTRY, b as buildWorkspaceHref, a as MAPLE_WORKSPACE_CATEGORIES } from "../../../chunks/workspace-state.js";
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function MapleTopBar($$renderer, $$props) {
  let title = fallback($$props["title"], "Mayple");
  let sourceText = fallback($$props["sourceText"], "Source: Frontend B orchestration runtime");
  let connected = fallback($$props["connected"], false);
  $$renderer.push(`<header${attr_class("top-bar", void 0, { "panel-connected": connected })}><div class="top-bar-brand"><span class="top-bar-title">${escape_html(title)}</span></div> <div class="top-bar-end"><span class="source-badge">${escape_html(sourceText)}</span> <button class="top-bar-icon-btn" type="button" aria-label="Refresh">↻</button></div></header>`);
  bind_props($$props, { title, sourceText, connected });
}
function MapleCategoryPills($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let activeIndex, hasActive;
    let categories = fallback($$props["categories"], () => [], true);
    let activeCategory = fallback($$props["activeCategory"], "observe");
    let hrefByCategory = fallback($$props["hrefByCategory"], () => ({}), true);
    activeIndex = Math.max(categories.findIndex((c) => c.id === activeCategory), 0);
    hasActive = categories.some((c) => c.id === activeCategory);
    $$renderer2.push(`<nav class="category-bar" aria-label="Workspace categories"><div class="category-track"${attr_style(`--pill-count:${Math.max(categories.length, 1)}; --active-index:${activeIndex};`)}><span${attr_class("category-indicator", void 0, { "is-active": hasActive })}></span> <!--[-->`);
    const each_array = ensure_array_like(categories);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let category = each_array[$$index];
      $$renderer2.push(`<a${attr_class("category-pill", void 0, { "is-active": activeCategory === category.id })}${attr("href", hrefByCategory[category.id] ?? "#")} role="tab"${attr("aria-selected", activeCategory === category.id)}>${escape_html(category.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></div></nav>`);
    bind_props($$props, { categories, activeCategory, hrefByCategory });
  });
}
function MapleViewTabs($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let views = fallback($$props["views"], () => [], true);
    let activeView = fallback($$props["activeView"], "");
    let labels = fallback($$props["labels"], () => ({}), true);
    let hrefByView = fallback($$props["hrefByView"], () => ({}), true);
    $$renderer2.push(`<div class="context-sub-tabs" role="tablist" aria-label="Category views"><!--[-->`);
    const each_array = ensure_array_like(views);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let view = each_array[$$index];
      $$renderer2.push(`<a${attr("href", hrefByView[view] ?? "#")}${attr_class("context-sub-tab", void 0, { "is-active": activeView === view })} role="tab"${attr("aria-selected", activeView === view)}>${escape_html(labels[view] ?? view)}</a>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { views, activeView, labels, hrefByView });
  });
}
function InterventionControlPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let filteredExecutions, activeExecution, targetValue;
    let executions = fallback($$props["executions"], () => [], true);
    let selectedExecutionId = fallback($$props["selectedExecutionId"], "");
    let targetInput = fallback($$props["targetInput"], "");
    let traceQuery = fallback($$props["traceQuery"], "");
    let sessionQuery = fallback($$props["sessionQuery"], "");
    let reason = fallback($$props["reason"], "");
    let busy = fallback($$props["busy"], "");
    let notice = fallback($$props["notice"], "");
    let error = fallback($$props["error"], "");
    let showConfirmStop = fallback($$props["showConfirmStop"], false);
    let setTraceQuery = fallback($$props["setTraceQuery"], () => {
    });
    let setSessionQuery = fallback($$props["setSessionQuery"], () => {
    });
    let selectExecution = fallback($$props["selectExecution"], () => {
    });
    let setTargetInput = fallback($$props["setTargetInput"], () => {
    });
    let setReason = fallback($$props["setReason"], () => {
    });
    let pauseExecution = fallback($$props["pauseExecution"], () => {
    });
    let resumeExecution = fallback($$props["resumeExecution"], () => {
    });
    let openStopConfirm = fallback($$props["openStopConfirm"], () => {
    });
    let cancelStopConfirm = fallback($$props["cancelStopConfirm"], () => {
    });
    let confirmStop = fallback($$props["confirmStop"], () => {
    });
    let manualTarget = "";
    filteredExecutions = executions.filter((execution) => {
      const traceMatch = !traceQuery || String(execution.executionId ?? "").toLowerCase().includes(traceQuery.toLowerCase());
      const sessionMatch = !sessionQuery || String(execution.sessionId ?? "").toLowerCase().includes(sessionQuery.toLowerCase());
      return traceMatch && sessionMatch;
    });
    activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? null;
    if (!manualTarget && targetInput) manualTarget = targetInput;
    targetValue = manualTarget || targetInput || activeExecution?.executionId || "";
    $$renderer2.push(`<section><h2>Audit &amp; Compliance Operations</h2> <p>Intervene directly on Frontend B executions with stop, replay, and escalation controls.</p> <div class="control-grid"><article class="panel"><div class="panel-head"><h3 class="panel-title">Traces + Sessions</h3> <span class="source-badge">${escape_html(filteredExecutions.length)}</span></div> <input class="input" placeholder="Search traces..." aria-label="Search traces"${attr("value", traceQuery)}/> <input class="input" placeholder="Search sessions..." aria-label="Search sessions"${attr("value", sessionQuery)}/> <div class="trace-list">`);
    if (filteredExecutions.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p>No traces loaded.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(filteredExecutions);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let execution = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr_class("trace-item", void 0, { "active": selectedExecutionId === execution.executionId })}><strong>${escape_html(execution.executionId)}</strong> <span>${escape_html(execution.sessionId ?? "session-n/a")}</span></button>`);
    }
    $$renderer2.push(`<!--]--></div></article> <article class="panel"><div class="panel-head"><h3 class="panel-title">Intervention Command Bar</h3> <span class="source-badge">Source: Frontend B orchestration runtime</span></div> <p>${escape_html(activeExecution ? `Target: ${activeExecution.executionId}` : "No trace/session target selected")}</p> <label>Trace or Session ID <input class="input" aria-label="Trace or Session ID"${attr("value", manualTarget)}/></label> <label>Reason <textarea class="textarea" aria-label="Reason" placeholder="Explain why this intervention is required.">`);
    const $$body = escape_html(reason);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea></label> <div class="actions"><button type="button" class="action-btn"${attr("disabled", busy !== "" || !targetValue, true)}>Pause</button> <button type="button" class="action-btn"${attr("disabled", busy !== "" || !targetValue, true)}>Resume</button> <button type="button" class="action-btn danger"${attr("disabled", busy !== "" || !targetValue, true)}>Stop</button></div> `);
    if (showConfirmStop) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="panel"><p>Confirm destructive action</p> <div class="actions"><button type="button" class="action-btn primary"${attr("disabled", !reason.trim() || busy !== "", true)}>Confirm</button> <button type="button" class="action-btn"${attr("disabled", busy !== "", true)}>Cancel</button></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (notice) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="ok">${escape_html(notice)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="err">${escape_html(error)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></article></div></section>`);
    bind_props($$props, {
      executions,
      selectedExecutionId,
      targetInput,
      traceQuery,
      sessionQuery,
      reason,
      busy,
      notice,
      error,
      showConfirmStop,
      setTraceQuery,
      setSessionQuery,
      selectExecution,
      setTargetInput,
      setReason,
      pauseExecution,
      resumeExecution,
      openStopConfirm,
      cancelStopConfirm,
      confirmStop
    });
  });
}
function TopologyView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let topologyRows;
    let endpoints = fallback($$props["endpoints"], () => [], true);
    const agents = [
      {
        id: "planner",
        label: "Planner Agent",
        role: "Intent + policy planning"
      },
      {
        id: "runtime",
        label: "Runtime Agent",
        role: "Execution coordinator"
      },
      {
        id: "guard",
        label: "Guard Agent",
        role: "Firewall + approval checks"
      }
    ];
    let popup = { status: "observed" };
    let modalTab = "guard";
    let selectedAgent = "runtime";
    topologyRows = endpoints.slice(0, 12).map((endpoint, index) => ({
      id: `${endpoint.host}-${index}`,
      source: index % 2 === 0 ? "Frontend B Runtime" : "Mayple Firewall",
      target: endpoint.host,
      decision: endpoint.status || "observed",
      agent: agents[index % agents.length].label
    }));
    $$renderer2.push(`<section class="view-panel topology-view panel"><header class="mw-view-header"><h1>Topology</h1> <p>Inspect runtime trace topology, agent decision handoffs, and node-level intervention options.</p></header> <article class="panel topology-canvas-panel"><div class="panel-head"><h2 class="panel-title">Agentic Decision Topology</h2> <span class="chip">${escape_html(topologyRows.length)} edges</span></div> <p class="panel-sub">Live runtime handoffs from Frontend B orchestration traces.</p> <div class="topology-map"><div class="topology-agent-grid"><div class="topology-agent-column"><h3 class="topology-section-title">Agent Interaction Grid</h3> <div class="topology-agent-list"><!--[-->`);
    const each_array = ensure_array_like(agents);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let agent = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr_class("topology-agent-card", void 0, { "active": selectedAgent === agent.id })}><strong>${escape_html(agent.label)}</strong> <span>${escape_html(agent.role)}</span></button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="topology-flow-column"><h3 class="topology-section-title">Decision Handoffs</h3> <div class="topology-flow-list">`);
    if (topologyRows.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="empty-row">No topology data yet.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array_1 = ensure_array_like(topologyRows);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let row = each_array_1[$$index_1];
      $$renderer2.push(`<button type="button" class="topology-flow-row"><span class="mono">${escape_html(row.source)}</span> <span class="topology-arrow">→</span> <span class="mono">${escape_html(row.target)}</span> <span${attr_class(`topology-state-chip ${stringify(row.decision)}`)}>${escape_html(row.decision)}</span></button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="topology-endpoint-column"><h3 class="topology-section-title">Endpoints</h3> `);
    if (endpoints.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="empty-row">No endpoint traces available yet.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array_2 = ensure_array_like(endpoints);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let endpoint = each_array_2[$$index_2];
      $$renderer2.push(`<button type="button"${attr_class(`topology-node surface ${stringify(endpoint.status)}`)}><strong>${escape_html(endpoint.host)}</strong> <span>Status: ${escape_html(endpoint.status)}</span></button>`);
    }
    $$renderer2.push(`<!--]--></div></div></div> <div${attr_class("topology-endpoint-popup", void 0, { "hidden": true })}><div class="topology-endpoint-head"><h3>Endpoint Request</h3> <button type="button" class="topology-endpoint-close">Close</button></div> <p class="topology-endpoint-sub">Requested domain / IP</p> <div class="topology-endpoint-host mono">${escape_html("-")}</div> <div class="topology-endpoint-row"><span class="topology-endpoint-label">Current decision</span> <span${attr_class(`topology-endpoint-status ${stringify(popup.status)}`)}>${escape_html(popup.status)}</span></div> <div class="topology-endpoint-actions"><button type="button" class="topology-endpoint-approve">Open Node Actions</button></div></div></article> <div${attr_class("modal", void 0, { "hidden": true })}><button type="button" class="modal-backdrop" aria-label="Close node modal"></button> <div class="modal-card" role="dialog" aria-modal="true" aria-label="Node action modal"><div class="modal-head"><h2>Node Actions</h2> <button type="button" class="action-btn">Close</button></div> <p class="modal-sub">Endpoint: <code>${escape_html("-")}</code></p> <div class="modal-tabs"><button type="button"${attr_class("modal-tab", void 0, { "is-active": modalTab === "guard" })}>Guard</button> <button type="button"${attr_class("modal-tab", void 0, { "is-active": modalTab === "fork" })}>Fork</button> <button type="button"${attr_class("modal-tab", void 0, { "is-active": modalTab === "risk" })}>Risk</button> <button type="button"${attr_class("modal-tab", void 0, { "is-active": modalTab === "growth" })}>Growth</button></div> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section class="modal-panel"><p>Set guard decision for this endpoint request.</p> <div class="actions"><button type="button" class="action-btn primary">Allow</button> <button type="button" class="action-btn danger">Block</button> <button type="button" class="action-btn">Pending</button></div> <input class="input" placeholder="Reason"/></section>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div></section>`);
    bind_props($$props, { endpoints });
  });
}
function DocsViews($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let view = fallback($$props["view"], "overview");
    let routePath = fallback($$props["routePath"], "/maple/observability");
    let endpoints = fallback($$props["endpoints"], () => [], true);
    let routeRecord = fallback($$props["routeRecord"], null);
    let runtimeCapabilities = fallback($$props["runtimeCapabilities"], () => [], true);
    const LEGACY_DOC_LINKS = Object.entries(docsByPath).map(([path, doc]) => ({ label: doc?.title ?? path, href: path }));
    const INCIDENT_FLOW = [
      "Pause execution to stop blast radius",
      "Inspect trace + topology + approval queue",
      "Retry node or replay from node",
      "Resume or cancel with explicit reason",
      "Escalate + step-up when required"
    ];
    if (view === "overview") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section class="view-panel docs-view"><header class="mw-view-header"><h1>Docs: Overview</h1> <p>Frontend B authors/executes orchestrations. Frontend A is the monitoring and intervention command center.</p></header> <div class="docs-grid"><article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Role Split</h2> <span class="chip">core model</span></div> <ul class="mw-simple-list"><li><strong>Frontend B</strong>: authoring, agent chats, orchestration execution.</li> <li><strong>Frontend A</strong>: monitoring, triage, pause/resume/stop intervention.</li> <li><strong>Boundary</strong>: monitoring context is B-origin runtime only.</li></ul></article> <article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Legacy Frontend A Docs Index</h2> <span class="chip">${escape_html(LEGACY_DOC_LINKS.length)}</span></div> <div class="docs-links-grid"><!--[-->`);
      const each_array = ensure_array_like(LEGACY_DOC_LINKS);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let item = each_array[$$index];
        $$renderer2.push(`<a class="docs-link-card"${attr("href", item.href)}>${escape_html(item.label)}</a>`);
      }
      $$renderer2.push(`<!--]--></div></article></div></section>`);
    } else if (view === "api") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<section class="view-panel docs-view"><header class="mw-view-header"><h1>Docs: API</h1> <p>Operational endpoint inventory for monitoring, intervention, policy, and integrations.</p></header> <div class="docs-grid"><article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Workspace Endpoints</h2> <span class="chip">${escape_html(endpoints.length)}</span></div> <div class="table-wrap"><table class="timeline-table"><thead><tr><th>Endpoint</th><th>Domain</th></tr></thead><tbody><!--[-->`);
      const each_array_1 = ensure_array_like(endpoints);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let endpoint = each_array_1[$$index_1];
        $$renderer2.push(`<tr><td class="mono">${escape_html(endpoint)}</td><td>${escape_html(endpoint.includes("/api/orchestrations") ? "Intervention" : endpoint.includes("/api/observability") ? "Monitoring" : endpoint.includes("/api/integrations") || endpoint.includes("/api/downstream") || endpoint.includes("/openclaw") ? "Integrations" : "General")}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div></article> <article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Runtime Capabilities</h2> <span class="chip">${escape_html(runtimeCapabilities.length)}</span></div> <ul class="mw-simple-list"><!--[-->`);
      const each_array_2 = ensure_array_like(runtimeCapabilities);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let item = each_array_2[$$index_2];
        $$renderer2.push(`<li><span class="mono">${escape_html(item.name ?? item.key ?? "capability")}</span> - ${escape_html(item.enabled ? "enabled" : "disabled")}</li>`);
      }
      $$renderer2.push(`<!--]--></ul></article></div></section>`);
    } else if (view === "runbooks") {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<section class="view-panel docs-view"><header class="mw-view-header"><h1>Docs: Runbooks</h1> <p>Operational incident response and intervention decision flow.</p></header> <div class="docs-grid"><article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Incident Sequence</h2> <span class="chip">pause -> inspect -> recover</span></div> <ol class="mw-simple-list"><!--[-->`);
      const each_array_3 = ensure_array_like(INCIDENT_FLOW);
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let step = each_array_3[$$index_3];
        $$renderer2.push(`<li>${escape_html(step)}.</li>`);
      }
      $$renderer2.push(`<!--]--></ol></article> <article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Action Semantics</h2></div> <ul class="mw-simple-list"><li><code>pause</code>: freeze active execution while triaging.</li> <li><code>resume</code>: continue after approvals and safety checks.</li> <li><code>cancel</code>: destructive stop, requires reason + confirm.</li> <li><code>retry-node</code>: rerun same branch step.</li> <li><code>replay-from-node</code>: create and execute safe fork branch.</li></ul></article></div></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<section class="view-panel docs-view"><header class="mw-view-header"><h1>Docs: Route Help</h1> <p>Contextual help for the active route and related anchors/endpoints.</p></header> <div class="docs-grid"><article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Current Route</h2> <span class="chip">${escape_html(routeRecord?.title ?? "unknown")}</span></div> <p><code>${escape_html(routePath)}</code></p> <p>${escape_html(routeRecord?.description ?? "No route metadata available.")}</p></article> <article class="panel docs-panel"><div class="panel-head"><h2 class="panel-title">Route Anchors</h2> <span class="chip">${escape_html(routeRecord?.anchors?.length ?? 0)}</span></div> <ul class="mw-simple-list">`);
      if (!routeRecord?.anchors?.length) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<li>No anchors registered.</li>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_4 = ensure_array_like(routeRecord.anchors);
        for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
          let anchor = each_array_4[$$index_4];
          $$renderer2.push(`<li><span class="mono">#${escape_html(anchor.id)}</span> ${escape_html(anchor.title)}</li>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></ul></article></div></section>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { view, routePath, endpoints, routeRecord, runtimeCapabilities });
  });
}
function buildMonitoringQuickPrompts({ executionId = "", sessionId = "", routeTitle = "" }) {
  const targetSuffix = executionId ? ` for execution ${executionId}` : sessionId ? ` for session ${sessionId}` : "";
  const routeSuffix = routeTitle ? ` in ${routeTitle}` : "";
  return Object.freeze([
    `Give me a monitoring status update${targetSuffix}${routeSuffix}.`,
    `What risk indicators are trending right now${targetSuffix}?`,
    `Any pending approvals or escalations${targetSuffix}?`,
    `What intervention do you recommend next${targetSuffix}?`
  ]);
}
function WorkspaceViewHost($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let activeExecution, activeExecutionId, activeSessionId, connectedProviders, catalogRows, appRows, toolRows, openclawRows, marketplaceRows, chatPrompts;
    let panelOpen = fallback($$props["panelOpen"], false);
    let state = $$props["state"];
    let routeRecord = fallback($$props["routeRecord"], null);
    let summary = fallback($$props["summary"], null);
    let slo = fallback($$props["slo"], null);
    let auditEvents = fallback($$props["auditEvents"], () => [], true);
    let approvals = fallback($$props["approvals"], () => [], true);
    let topologyEndpoints = fallback($$props["topologyEndpoints"], () => [], true);
    let executions = fallback($$props["executions"], () => [], true);
    let runtimeCapabilities = fallback($$props["runtimeCapabilities"], () => [], true);
    let integrationCatalog = fallback($$props["integrationCatalog"], () => [], true);
    let connectedIntegrations = fallback($$props["connectedIntegrations"], () => [], true);
    let downstreamApps = fallback($$props["downstreamApps"], () => [], true);
    let downstreamTools = fallback($$props["downstreamTools"], () => [], true);
    let openclawCatalog = fallback($$props["openclawCatalog"], () => [], true);
    let authMe = fallback($$props["authMe"], null);
    let selectedExecutionId = fallback($$props["selectedExecutionId"], "");
    let targetInput = fallback($$props["targetInput"], "");
    let traceQuery = fallback($$props["traceQuery"], "");
    let sessionQuery = fallback($$props["sessionQuery"], "");
    let reason = fallback($$props["reason"], "");
    let busy = fallback($$props["busy"], "");
    let notice = fallback($$props["notice"], "");
    let error = fallback($$props["error"], "");
    let showConfirmStop = fallback($$props["showConfirmStop"], false);
    let allEndpoints = fallback($$props["allEndpoints"], () => [], true);
    let setTraceQuery = fallback($$props["setTraceQuery"], () => {
    });
    let setSessionQuery = fallback($$props["setSessionQuery"], () => {
    });
    let selectExecution = fallback($$props["selectExecution"], () => {
    });
    let setTargetInput = fallback($$props["setTargetInput"], () => {
    });
    let setReason = fallback($$props["setReason"], () => {
    });
    let pauseExecution = fallback($$props["pauseExecution"], () => {
    });
    let resumeExecution = fallback($$props["resumeExecution"], () => {
    });
    let openStopConfirm = fallback($$props["openStopConfirm"], () => {
    });
    let cancelStopConfirm = fallback($$props["cancelStopConfirm"], () => {
    });
    let confirmStop = fallback($$props["confirmStop"], () => {
    });
    const INITIAL_CHAT_MESSAGE = Object.freeze({
      id: "observe-chat-initial",
      role: "assistant",
      content: "Monitoring agent connected. Ask for live firewall posture, risk drift, approvals, or intervention guidance."
    });
    let chatMessages = [INITIAL_CHAT_MESSAGE];
    let chatInput = "";
    let chatBusy = false;
    activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? executions[0] ?? null;
    activeExecutionId = String(activeExecution?.executionId ?? targetInput ?? "");
    activeSessionId = String(activeExecution?.sessionId ?? "");
    connectedProviders = new Set(connectedIntegrations.map((item) => String(item.provider ?? item.id ?? "").toLowerCase()));
    catalogRows = integrationCatalog.map((item) => {
      const provider = String(item.provider ?? item.id ?? "").toLowerCase();
      const connected = connectedProviders.has(provider);
      return {
        source: "Integrations",
        app: String(item.name ?? item.provider ?? item.id ?? "Unknown"),
        kind: String(item.category ?? "integration"),
        status: connected ? "connected" : String(item.status ?? "available"),
        detail: String(item.description ?? "")
      };
    });
    appRows = downstreamApps.map((item) => ({
      source: "Downstream App",
      app: String(item.name ?? item.appId ?? item.id ?? "Unknown"),
      kind: "app",
      status: String(item.status ?? "connected"),
      detail: String(item.id ?? item.appId ?? "")
    }));
    toolRows = downstreamTools.map((item) => ({
      source: "Downstream Tool",
      app: String(item.name ?? item.toolId ?? item.id ?? "Unknown"),
      kind: "tool",
      status: "enabled",
      detail: String(item.app ?? "")
    }));
    openclawRows = openclawCatalog.map((item) => ({
      source: "OpenClaw",
      app: String(item.name ?? item.tool ?? item.id ?? "Unknown"),
      kind: "agent-tool",
      status: "enabled",
      detail: String(item.description ?? "")
    }));
    marketplaceRows = [...catalogRows, ...appRows, ...toolRows, ...openclawRows];
    chatPrompts = buildMonitoringQuickPrompts({
      executionId: activeExecutionId,
      sessionId: activeSessionId,
      routeTitle: routeRecord?.title ?? ""
    });
    if (panelOpen && state.category === "observe" && state.view === "live") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section class="view-panel live-view panel"><header class="mw-view-header"><h1>Observability &amp; Alerts</h1> <p>Monitor Frontend B orchestration runtime and intervene when risk escalates.</p></header> <p data-testid="monitoring-context-explainer">Monitoring context and live runtime posture.</p> <div class="card-grid"><article class="card"><h3>Summary</h3><pre>${escape_html(JSON.stringify(summary ?? {}, null, 2))}</pre></article> <article class="card"><h3>SLO</h3><pre>${escape_html(JSON.stringify(slo ?? {}, null, 2))}</pre></article></div></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "chat" && state.view === "chat") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section data-view-panel="chat" class="view-panel chat-view panel"><header class="mw-view-header"><h1>Monitoring Chat</h1> <p>Chat with the monitoring agent for live firewall updates and intervention recommendations.</p></header> <article class="panel"><div class="panel-head"><h2 class="panel-title">Monitoring Agent</h2> <span class="chip">${escape_html(activeExecutionId ? `execution=${activeExecutionId}` : activeSessionId ? `session=${activeSessionId}` : "target=unselected")}</span></div> <div class="mw-chat-prompts"><!--[-->`);
      const each_array = ensure_array_like(chatPrompts);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let prompt = each_array[$$index];
        $$renderer2.push(`<button type="button" class="mw-chat-prompt"${attr("disabled", chatBusy, true)}>${escape_html(prompt)}</button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="mw-chat-log" role="log" aria-live="polite"><!--[-->`);
      const each_array_1 = ensure_array_like(chatMessages);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let message = each_array_1[$$index_1];
        $$renderer2.push(`<article${attr_class(`mw-chat-bubble ${stringify(message.role === "user" ? "mw-chat-bubble-user" : "mw-chat-bubble-assistant")}`)}><p>${escape_html(message.content)}</p></article>`);
      }
      $$renderer2.push(`<!--]--></div> <form class="mw-chat-form"><input type="text"${attr("value", chatInput)} placeholder="Ask for monitoring updates, risk drift, or next intervention..." autocomplete="off"/> <button type="submit"${attr("disabled", !chatInput.trim(), true)}>${escape_html("Send")}</button></form> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></article></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "observe" && state.view === "timeline") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section data-view-panel="timeline" class="view-panel timeline-view panel"><header class="mw-view-header"><h1>Timeline</h1> <p>Ordered Frontend B runtime events for incident triage and intervention sequencing.</p></header> <article class="panel"><div class="panel-head"><h2 class="panel-title">Runtime Event Stream</h2> <span class="chip">${escape_html(auditEvents.length)}</span></div> `);
      if (auditEvents.length === 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="empty-row">No B-origin events available.</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div class="timeline-table-wrap"><table class="timeline-table" id="timelineBody"><thead><tr><th>Event</th><th>Execution</th><th>Timestamp</th><th>Source</th></tr></thead><tbody><!--[-->`);
      const each_array_2 = ensure_array_like(auditEvents);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let event = each_array_2[$$index_2];
        $$renderer2.push(`<tr><td>${escape_html(event.eventType ?? event.type ?? event.action ?? "event")}</td><td class="mono">${escape_html(event.executionId ?? event.traceId ?? "-")}</td><td>${escape_html(event.timestamp ?? event.createdAt ?? "-")}</td><td>${escape_html(event.source ?? event.origin ?? "runtime")}</td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div></article></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "analyze" && state.view === "control") {
      $$renderer2.push("<!--[0-->");
      InterventionControlPanel($$renderer2, {
        executions,
        selectedExecutionId,
        targetInput,
        traceQuery,
        sessionQuery,
        reason,
        busy,
        notice,
        error,
        showConfirmStop,
        setTraceQuery,
        setSessionQuery,
        selectExecution,
        setTargetInput,
        setReason,
        pauseExecution,
        resumeExecution,
        openStopConfirm,
        cancelStopConfirm,
        confirmStop
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "analyze" && state.view === "topology") {
      $$renderer2.push("<!--[0-->");
      TopologyView($$renderer2, { endpoints: topologyEndpoints });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "admin" && state.view === "settings") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section data-view-panel="settings" class="view-panel settings-view panel"><header class="mw-view-header"><h1>Settings</h1> <p>Runtime, auth, and configuration health for the monitoring + intervention console.</p></header> <div class="docs-grid"><article class="panel settings-panel"><div class="panel-head"><h2 class="panel-title">Runtime Capabilities</h2> <span class="chip">${escape_html(runtimeCapabilities.length)}</span></div> `);
      if (runtimeCapabilities.length === 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="empty-row">No capability records returned.</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="settings-actions"><!--[-->`);
        const each_array_3 = ensure_array_like(runtimeCapabilities);
        for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
          let item = each_array_3[$$index_3];
          $$renderer2.push(`<div class="settings-chip-row"><span class="mono">${escape_html(item.name ?? item.key ?? "capability")}</span> <span${attr_class(`chip ${stringify(item.enabled ? "ok-chip" : "warn-chip")}`)}>${escape_html(item.enabled ? "enabled" : "disabled")}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></article> <article class="panel settings-panel"><div class="panel-head"><h2 class="panel-title">Operator Session</h2> <span class="chip">auth</span></div> <div class="settings-actions"><div class="settings-chip-row"><span>User</span><span class="mono">${escape_html(authMe?.email ?? authMe?.username ?? "unknown")}</span></div> <div class="settings-chip-row"><span>Source</span><span class="chip">Frontend B orchestration runtime</span></div> <div class="settings-chip-row"><span>Active traces</span><span class="mono">${escape_html(executions.length)}</span></div> <div class="settings-chip-row"><span>Pending approvals</span><span class="mono">${escape_html(approvals.length)}</span></div></div></article> <article class="panel settings-panel"><div class="panel-head"><h2 class="panel-title">Endpoint Health Snapshot</h2> <span class="chip">${escape_html(allEndpoints.length)}</span></div> <div class="settings-actions"><!--[-->`);
      const each_array_4 = ensure_array_like(allEndpoints.slice(0, 10));
      for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
        let endpoint = each_array_4[$$index_4];
        $$renderer2.push(`<div class="settings-chip-row"><span class="mono">${escape_html(endpoint)}</span> <span class="chip ok-chip">registered</span></div>`);
      }
      $$renderer2.push(`<!--]--></div></article></div></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "admin" && state.view === "policy") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section data-view-panel="policy" class="view-panel policy-view panel"><header class="mw-view-header"><h1>Policy Operations</h1> <p>Unified guardrails, approvals, and recovery decisions for live Frontend B executions.</p></header> <div class="docs-grid"><article class="panel policy-panel"><div class="panel-head"><h2 class="panel-title">Approval Queue</h2> <span class="chip">${escape_html(approvals.length)}</span></div> `);
      if (approvals.length === 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="empty-row">No pending approvals.</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="table-wrap"><table class="timeline-table"><thead><tr><th>Approval</th><th>Execution</th><th>Status</th><th>Created</th></tr></thead><tbody><!--[-->`);
        const each_array_5 = ensure_array_like(approvals);
        for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
          let approval = each_array_5[$$index_5];
          $$renderer2.push(`<tr><td class="mono">${escape_html(approval.approvalId ?? approval.id ?? "approval")}</td><td class="mono">${escape_html(approval.executionId ?? "-")}</td><td>${escape_html(approval.status ?? "pending")}</td><td>${escape_html(approval.createdAt ?? approval.timestamp ?? "-")}</td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]--></article> <article class="panel policy-panel"><div class="panel-head"><h2 class="panel-title">Recovery Strategy</h2> <span class="chip">playbook</span></div> <ol class="mw-simple-list"><li>Pause execution to freeze blast radius.</li> <li>Inspect blocked nodes and evidence in Topology + Trace detail.</li> <li>Use \`retry-node\` for same branch continuation.</li> <li>Use \`replay-from-node\` for safe branch fork and validation.</li> <li>Resume execution or stop with explicit reason when unrecoverable.</li></ol> <p>Current execution target: <span class="mono">${escape_html(activeExecutionId || "unselected")}</span></p></article> <article class="panel policy-panel"><div class="panel-head"><h2 class="panel-title">Policy Guarantees</h2></div> <div class="settings-actions"><div class="settings-chip-row"><span>Destructive actions</span><span class="chip warn-chip">confirm + reason</span></div> <div class="settings-chip-row"><span>Step-up required</span><span class="chip warn-chip">challenge/verify</span></div> <div class="settings-chip-row"><span>Escalation + break-glass</span><span class="chip">auditable</span></div> <div class="settings-chip-row"><span>Monitoring source</span><span class="chip ok-chip">Frontend B runtime only</span></div></div></article></div></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "admin" && state.view === "marketplace") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<section data-view-panel="marketplace" class="view-panel marketplace-view panel"><header class="mw-view-header"><h1>Marketplace</h1> <p>Approved apps and every integrated tool currently enabled for OpenClaw and downstream runtime.</p></header> <article class="panel marketplace-panel"><div class="panel-head"><h2 class="panel-title">Integration Inventory</h2> <span class="chip">${escape_html(marketplaceRows.length)}</span></div> `);
      if (marketplaceRows.length === 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="empty-row">No integrated apps/tools returned.</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="table-wrap"><table class="timeline-table"><thead><tr><th>Source</th><th>Name</th><th>Kind</th><th>Status</th><th>Detail</th></tr></thead><tbody><!--[-->`);
        const each_array_6 = ensure_array_like(marketplaceRows);
        for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
          let row = each_array_6[$$index_6];
          $$renderer2.push(`<tr><td>${escape_html(row.source)}</td><td class="mono">${escape_html(row.app)}</td><td>${escape_html(row.kind)}</td><td><span${attr_class(`chip ${stringify(row.status === "connected" || row.status === "enabled" ? "ok-chip" : "warn-chip")}`)}>${escape_html(row.status)}</span></td><td>${escape_html(row.detail || "-")}</td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table></div>`);
      }
      $$renderer2.push(`<!--]--></article></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (panelOpen && state.category === "docs") {
      $$renderer2.push("<!--[0-->");
      DocsViews($$renderer2, {
        view: state.view,
        routePath: state.routePath,
        endpoints: allEndpoints,
        routeRecord,
        runtimeCapabilities
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, {
      panelOpen,
      state,
      routeRecord,
      summary,
      slo,
      auditEvents,
      approvals,
      topologyEndpoints,
      executions,
      runtimeCapabilities,
      integrationCatalog,
      connectedIntegrations,
      downstreamApps,
      downstreamTools,
      openclawCatalog,
      authMe,
      selectedExecutionId,
      targetInput,
      traceQuery,
      sessionQuery,
      reason,
      busy,
      notice,
      error,
      showConfirmStop,
      allEndpoints,
      setTraceQuery,
      setSessionQuery,
      selectExecution,
      setTargetInput,
      setReason,
      pauseExecution,
      resumeExecution,
      openStopConfirm,
      cancelStopConfirm,
      confirmStop
    });
  });
}
const B_ORIGIN_HINTS = ["frontend-b", "frontendb", "orchestrate", "orchestration", "openclaw", "runtime"];
const EXCLUDED_HINTS = ["frontend-a", "frontenda", "it-console", "manual", "local", "docs"];
function hasHint(value, hints) {
  const normalized = String(value ?? "").toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}
function collectOriginCandidates(record) {
  if (!record || typeof record !== "object") {
    return [];
  }
  const fields = [
    record.source,
    record.origin,
    record.producer,
    record.channel,
    record.client,
    record.app,
    record.metadata?.source,
    record.metadata?.origin,
    record.trace?.source,
    record.trace?.origin
  ];
  return fields.filter((value) => typeof value === "string" && value.trim().length > 0);
}
function isFrontendBOriginRecord(record) {
  const candidates = collectOriginCandidates(record);
  if (candidates.some((value) => hasHint(value, EXCLUDED_HINTS))) {
    return false;
  }
  if (candidates.some((value) => hasHint(value, B_ORIGIN_HINTS))) {
    return true;
  }
  if (record && typeof record === "object") {
    const hasOrchestrationIdentity = typeof record.executionId === "string" || typeof record.orchestrationId === "string" || typeof record.traceId === "string" || typeof record.sessionId === "string";
    return Boolean(hasOrchestrationIdentity);
  }
  return false;
}
function filterFrontendBOrigin(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.filter((record) => isFrontendBOriginRecord(record));
}
async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
function buildError(message, options = {}) {
  const error = new Error(message);
  error.stepUpRequired = Boolean(options.stepUpRequired);
  error.payload = options.payload ?? null;
  return error;
}
function detectStepUp(payload, fallbackMessage) {
  if (payload?.stepUpRequired === true) {
    return true;
  }
  const message = String(payload?.message ?? fallbackMessage ?? "").toLowerCase();
  return message.includes("step-up") || message.includes("challenge token");
}
async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    const message = payload?.message || `${path} -> ${response.status}`;
    throw buildError(message, {
      stepUpRequired: detectStepUp(payload, message),
      payload
    });
  }
  return payload;
}
function withChallengeToken(payload, challengeToken) {
  if (!challengeToken) {
    return payload;
  }
  return {
    ...payload,
    challengeToken
  };
}
function interventionActionCatalog() {
  return {
    pauseExecution: {
      label: "Pause",
      destructive: false,
      execute: ({ executionId, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/pause`,
        withChallengeToken({}, challengeToken)
      )
    },
    resumeExecution: {
      label: "Resume",
      destructive: false,
      execute: ({ executionId, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/resume`,
        withChallengeToken({}, challengeToken)
      )
    },
    cancelExecution: {
      label: "Cancel",
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, reason, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/cancel`,
        withChallengeToken({ reason }, challengeToken)
      )
    },
    retryNode: {
      label: "Retry Node",
      destructive: false,
      execute: ({ executionId, nodeId, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/retry-node`,
        withChallengeToken({ nodeId }, challengeToken)
      )
    },
    replayNode: {
      label: "Replay Node",
      destructive: false,
      execute: ({ executionId, nodeId, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/replay-from-node`,
        withChallengeToken({ nodeId }, challengeToken)
      )
    },
    approveDecision: {
      label: "Approve",
      destructive: false,
      execute: ({ executionId, approvalId, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
        withChallengeToken({ action: "approve" }, challengeToken)
      )
    },
    rejectDecision: {
      label: "Reject",
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, approvalId, reason, challengeToken }) => postJson(
        `/api/orchestrations/executions/${encodeURIComponent(executionId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
        withChallengeToken({ action: "reject", reason }, challengeToken)
      )
    },
    escalate: {
      label: "Escalate",
      destructive: false,
      execute: ({ executionId, sessionId, reason, challengeToken }) => postJson(
        "/api/operations/orchestrations/escalation/escalate",
        withChallengeToken({ executionId, sessionId, reason }, challengeToken)
      )
    },
    executeBreakGlass: {
      label: "Break-glass",
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, sessionId, reason, challengeToken }) => postJson(
        "/api/operations/orchestrations/break-glass",
        withChallengeToken({ executionId, sessionId, reason }, challengeToken)
      )
    },
    reviewBreakGlass: {
      label: "Review Break-glass",
      destructive: false,
      execute: ({ breakGlassReviewId, reason, challengeToken }) => postJson(
        `/api/operations/orchestrations/break-glass/${encodeURIComponent(breakGlassReviewId)}/review`,
        withChallengeToken({ reason }, challengeToken)
      )
    },
    requestStepUp: {
      label: "Step-up Challenge",
      destructive: false,
      execute: ({ executionId, sessionId }) => postJson("/api/operations/orchestrations/step-up/challenge", { executionId, sessionId })
    },
    verifyStepUp: {
      label: "Step-up Verify",
      destructive: false,
      execute: ({ executionId, sessionId, challengeToken }) => postJson("/api/operations/orchestrations/step-up/verify", {
        executionId,
        sessionId,
        challengeToken
      })
    },
    cancelSession: {
      label: "Stop Session",
      destructive: true,
      requiresReason: true,
      execute: ({ sessionId, reason, challengeToken }) => postJson(
        `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`,
        withChallengeToken({ reason }, challengeToken)
      )
    }
  };
}
function MapleShell($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let explicitState, panelOpen, activeExecution, topologyEndpoints, allEndpoints, categoryHrefById, viewHrefById;
    const actions = interventionActionCatalog();
    const asArray = (value) => Array.isArray(value) ? value : [];
    let state = resolveWorkspaceState({ pathname: "/maple", searchParams: new URLSearchParams() });
    let summary = null;
    let slo = null;
    let auditEvents = [];
    let approvals = [];
    let executions = [];
    let runtimeCapabilities = [];
    let integrationCatalog = [];
    let connectedIntegrations = [];
    let downstreamApps = [];
    let downstreamTools = [];
    let openclawCatalog = [];
    let authMe = null;
    let selectedExecutionId = "";
    let reason = "";
    let showConfirmStop = false;
    let busy = "";
    let notice = "";
    let error = "";
    let traceQuery = "";
    let sessionQuery = "";
    let targetInput = "";
    let chatInput = "";
    let hasPrompted = false;
    const quickPrompts = [
      "Give me a firewall status update.",
      "Why was this trace blocked?",
      "What should we do next to reduce risk?",
      "What is the current risk score?"
    ];
    const tabsByCategory = {
      observe: ["live", "timeline"],
      chat: ["chat"],
      analyze: ["control", "topology"],
      admin: ["settings", "policy", "marketplace"],
      docs: ["overview", "api", "runbooks", "route-help"]
    };
    const tabLabels = {
      live: "Live",
      chat: "Chat",
      timeline: "Timeline",
      control: "Control",
      topology: "Topology",
      settings: "Settings",
      policy: "Policy",
      marketplace: "Marketplace",
      overview: "Overview",
      api: "API",
      runbooks: "Runbooks",
      "route-help": "Route Help"
    };
    async function loadData() {
      try {
        const [
          summaryRes,
          sloRes,
          auditRes,
          execRes,
          approvalsRes,
          runtimeCapabilitiesRes,
          integrationCatalogRes,
          connectedIntegrationsRes,
          downstreamAppsRes,
          downstreamToolsRes,
          openclawCatalogRes,
          authMeRes
        ] = await Promise.allSettled([
          fetch("/api/observability/orchestrations/summary").then((r) => r.json()),
          fetch("/api/observability/orchestrations/slo").then((r) => r.json()),
          fetch("/api/observability/orchestrations/audit-log?offset=0&limit=50").then((r) => r.json()),
          fetch("/api/orchestrations/executions?limit=50").then((r) => r.json()),
          fetch("/api/orchestrations/executions/approvals?status=pending&limit=50").then((r) => r.json()),
          fetch("/api/runtime/feature-capabilities").then((r) => r.json()),
          fetch("/api/integrations/catalog").then((r) => r.json()),
          fetch("/api/integrations").then((r) => r.json()),
          fetch("/api/downstream/apps").then((r) => r.json()),
          fetch("/api/downstream/tools").then((r) => r.json()),
          fetch("/api/openclaw/cli/catalog").then((r) => r.json()),
          fetch("/api/auth/me").then((r) => r.json())
        ]);
        if (summaryRes.status === "fulfilled") summary = summaryRes.value;
        if (sloRes.status === "fulfilled") slo = sloRes.value;
        if (auditRes.status === "fulfilled") {
          const events = auditRes.value?.items ?? auditRes.value?.entries ?? auditRes.value?.events ?? [];
          auditEvents = filterFrontendBOrigin(events);
        }
        if (execRes.status === "fulfilled") {
          const items = execRes.value?.items ?? execRes.value?.executions ?? [];
          executions = filterFrontendBOrigin(items);
        }
        if (approvalsRes.status === "fulfilled") {
          const items = approvalsRes.value?.items ?? approvalsRes.value?.approvals ?? approvalsRes.value?.entries ?? [];
          approvals = filterFrontendBOrigin(items);
        }
        if (runtimeCapabilitiesRes.status === "fulfilled") {
          runtimeCapabilities = asArray(runtimeCapabilitiesRes.value?.items ?? runtimeCapabilitiesRes.value?.capabilities ?? runtimeCapabilitiesRes.value);
        }
        if (integrationCatalogRes.status === "fulfilled") {
          integrationCatalog = asArray(integrationCatalogRes.value?.integrations ?? integrationCatalogRes.value?.items);
        }
        if (connectedIntegrationsRes.status === "fulfilled") {
          connectedIntegrations = asArray(connectedIntegrationsRes.value?.integrations ?? connectedIntegrationsRes.value?.items);
        }
        if (downstreamAppsRes.status === "fulfilled") {
          downstreamApps = asArray(downstreamAppsRes.value?.apps ?? downstreamAppsRes.value?.items);
        }
        if (downstreamToolsRes.status === "fulfilled") {
          downstreamTools = asArray(downstreamToolsRes.value?.tools ?? downstreamToolsRes.value?.items);
        }
        if (openclawCatalogRes.status === "fulfilled") {
          openclawCatalog = asArray(openclawCatalogRes.value?.catalog ?? openclawCatalogRes.value?.items);
        }
        if (authMeRes.status === "fulfilled") {
          authMe = authMeRes.value?.user ?? null;
        }
        if (!selectedExecutionId && executions.length > 0) selectedExecutionId = executions[0].executionId;
      } catch (loadError) {
        error = loadError instanceof Error ? loadError.message : "Failed loading runtime data.";
      }
    }
    function selectExecution(value) {
      selectedExecutionId = value;
      if (value) targetInput = value;
    }
    function setTargetInput(value) {
      targetInput = value;
      selectedExecutionId = value;
    }
    async function runAction(actionName, targetOverride = "") {
      const action = actions[actionName];
      if (!action) return;
      const typed = String(targetOverride || targetInput || "").trim();
      const isSessionTarget = typed.toLowerCase().startsWith("sess") || typed.toLowerCase().includes("session");
      const executionId = isSessionTarget ? "" : typed || selectedExecutionId || activeExecution?.executionId || "";
      const selected = executions.find((entry) => entry.executionId === executionId);
      const sessionId = isSessionTarget ? typed : selected?.sessionId ?? activeExecution?.sessionId ?? "";
      if (!executionId && (actionName === "pauseExecution" || actionName === "resumeExecution" || actionName === "cancelExecution")) {
        error = "Select a trace first.";
        return;
      }
      if (action.requiresReason && !reason.trim()) {
        error = "Reason is required for this action.";
        return;
      }
      busy = actionName;
      error = "";
      notice = "";
      try {
        await action.execute({ executionId, sessionId, reason: reason.trim() });
        notice = `${action.label} completed.`;
        await loadData();
      } catch (requestError) {
        error = requestError instanceof Error ? requestError.message : "Action failed.";
      } finally {
        busy = "";
        showConfirmStop = false;
      }
    }
    state = resolveWorkspaceState({
      pathname: store_get($$store_subs ??= {}, "$page", page).url.pathname,
      searchParams: store_get($$store_subs ??= {}, "$page", page).url.searchParams
    });
    explicitState = ["category", "view", "route"].some((key) => store_get($$store_subs ??= {}, "$page", page).url.searchParams.has(key));
    panelOpen = explicitState && state.category !== "chat";
    activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? executions[0] ?? null;
    if (!targetInput && state.executionId) targetInput = state.executionId;
    if (!targetInput && state.sessionId) targetInput = state.sessionId;
    if (!targetInput && activeExecution?.executionId) targetInput = activeExecution.executionId;
    topologyEndpoints = (() => {
      const seen = /* @__PURE__ */ new Set();
      const output = [];
      for (const event of auditEvents) {
        const host = String(event.url ?? event.domain ?? event.host ?? event.destination ?? event.target ?? "").trim();
        const fallback2 = String(event.traceId ?? event.executionId ?? "").trim();
        const key = host || (fallback2 ? `trace:${fallback2}` : "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        output.push({
          host: key,
          status: String(event.status ?? event.severity ?? "observed").toLowerCase()
        });
      }
      return output;
    })();
    allEndpoints = Array.from(new Set(MAPLE_ROUTE_REGISTRY.flatMap((route) => route.apiEndpoints))).sort();
    buildWorkspaceHref({
      category: state.category,
      view: state.view,
      routePath: state.routePath,
      executionId: state.executionId,
      sessionId: state.sessionId
    });
    `${store_get($$store_subs ??= {}, "$page", page).url.pathname}${store_get($$store_subs ??= {}, "$page", page).url.search}`;
    categoryHrefById = Object.fromEntries(MAPLE_WORKSPACE_CATEGORIES.map((category) => [
      category.id,
      buildWorkspaceHref({
        category: category.id,
        view: category.id === "docs" ? "overview" : category.id === "observe" ? "live" : category.id === "chat" ? "chat" : category.id === "analyze" ? "control" : "settings",
        routePath: state.routePath,
        executionId: targetInput || (activeExecution?.executionId ?? ""),
        sessionId: activeExecution?.sessionId ?? ""
      })
    ]));
    viewHrefById = Object.fromEntries((tabsByCategory[state.category] ?? []).map((view) => [
      view,
      buildWorkspaceHref({
        category: state.category,
        view,
        routePath: state.routePath,
        executionId: targetInput || (activeExecution?.executionId ?? ""),
        sessionId: activeExecution?.sessionId ?? ""
      })
    ]));
    $$renderer2.push(`<section class="workspace product-body" data-testid="maple-workspace-layout"><div class="product-shell shell" data-testid="maple-workspace-shell">`);
    MapleTopBar($$renderer2, { connected: panelOpen });
    $$renderer2.push(`<!----> <div class="main-area"><div${attr_class("chat-home", void 0, { "panel-active": panelOpen })}><div${attr_class("welcome-state", void 0, { "is-hidden": state.category !== "chat" || hasPrompted })}><h2 class="welcome-heading">What can I help with?</h2> <p class="welcome-sub">Connected to Frontend B orchestration runtime stream.</p> <div class="welcome-pills"><!--[-->`);
    const each_array = ensure_array_like(quickPrompts);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let prompt = each_array[$$index];
      $$renderer2.push(`<button type="button" class="welcome-pill">${escape_html(prompt)}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div${attr_class("context-panel", void 0, { "is-open": panelOpen })}${attr("aria-hidden", !panelOpen)}><div class="context-panel-body">`);
    WorkspaceViewHost($$renderer2, {
      panelOpen,
      state,
      routeRecord: state.routeRecord,
      summary,
      slo,
      auditEvents,
      approvals,
      topologyEndpoints,
      executions,
      runtimeCapabilities,
      integrationCatalog,
      connectedIntegrations,
      downstreamApps,
      downstreamTools,
      openclawCatalog,
      authMe,
      selectedExecutionId,
      targetInput,
      traceQuery,
      sessionQuery,
      reason,
      busy,
      notice,
      error,
      showConfirmStop,
      allEndpoints,
      setTraceQuery: (value) => traceQuery = value,
      setSessionQuery: (value) => sessionQuery = value,
      selectExecution,
      setTargetInput,
      setReason: (value) => reason = value,
      pauseExecution: (target) => runAction("pauseExecution", target),
      resumeExecution: (target) => runAction("resumeExecution", target),
      openStopConfirm: () => showConfirmStop = true,
      cancelStopConfirm: () => showConfirmStop = false,
      confirmStop: (target) => runAction("cancelExecution", target)
    });
    $$renderer2.push(`<!----></div> <div class="context-panel-foot">`);
    MapleViewTabs($$renderer2, {
      views: tabsByCategory[state.category] ?? [],
      activeView: state.view,
      labels: tabLabels,
      hrefByView: viewHrefById
    });
    $$renderer2.push(`<!----></div></div> `);
    MapleCategoryPills($$renderer2, {
      categories: MAPLE_WORKSPACE_CATEGORIES,
      activeCategory: state.category,
      hrefByCategory: categoryHrefById
    });
    $$renderer2.push(`<!----> `);
    if (state.category === "chat") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="chat-composer chat-composer-home"><div class="chat-input-wrap"><input${attr("value", chatInput)} placeholder="Ask Mayple to summarize runtime context..." aria-label="Mayple chat input"/> <button type="button" class="chat-send-btn" aria-label="Send">↑</button></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div></div></section>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _page($$renderer) {
  MapleShell($$renderer);
}
export {
  _page as default
};
