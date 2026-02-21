const LOADING_KIRBY_SVG = `<svg class="kirby-mascot loading-kirby" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="90" r="72" fill="url(#kirbyBodyGrad-brand)"/><g class="kirby-eye"><ellipse cx="78" cy="78" rx="9" ry="12" fill="#111"/><ellipse cx="122" cy="78" rx="9" ry="12" fill="#111"/><circle cx="81" cy="73" r="3.5" fill="white"/><circle cx="125" cy="73" r="3.5" fill="white"/></g><ellipse cx="58" cy="100" rx="14" ry="9" fill="#ff9966" opacity="0.5"/><ellipse cx="142" cy="100" rx="14" ry="9" fill="#ff9966" opacity="0.5"/><path d="M85 105 Q100 120 115 105" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="72" cy="168" rx="22" ry="14" fill="#d06800"/><ellipse cx="128" cy="168" rx="22" ry="14" fill="#d06800"/></svg>`;

const statusEl = document.getElementById("status");
const pollDotEl = document.getElementById("pollDot");
const pollStateEl = document.getElementById("pollState");
const demoSessionIdInput = document.getElementById("demoSessionId");
const demoSourceSelect = document.getElementById("demoSource");
const demoStartBtn = document.getElementById("demoStartBtn");
const demoAuditBtn = document.getElementById("demoAuditBtn");
const demoBlockBtn = document.getElementById("demoBlockBtn");
const demoForkBtn = document.getElementById("demoForkBtn");
const demoFullBtn = document.getElementById("demoFullBtn");
const demoResultEl = document.getElementById("demoResult");
const injectActorSelect = document.getElementById("injectActor");
const injectTypeSelect = document.getElementById("injectType");
const injectCommandInput = document.getElementById("injectCommand");
const injectOutputInput = document.getElementById("injectOutput");
const injectToolNameInput = document.getElementById("injectToolName");
const injectUrlInput = document.getElementById("injectUrl");
const injectEventBtn = document.getElementById("injectEventBtn");
const injectResultEl = document.getElementById("injectResult");
const firewallChatLogEl = document.getElementById("firewallChatLog");
const firewallChatInputEl = document.getElementById("firewallChatInput");
const firewallChatSendBtn = document.getElementById("firewallChatSendBtn");
const firewallChatRefreshBtn = document.getElementById("firewallChatRefreshBtn");
const firewallChatContextEl = document.getElementById("firewallChatContext");
const nodeActionModalEl = document.getElementById("nodeActionModal");
const nodeModalCloseBtn = document.getElementById("nodeModalCloseBtn");
const nodeModalSummaryEl = document.getElementById("nodeModalSummary");
const nodeModalTraceIdEl = document.getElementById("nodeModalTraceId");
const nodeModalSessionIdEl = document.getElementById("nodeModalSessionId");
const nodeModalStepIndexEl = document.getElementById("nodeModalStepIndex");
const nodeModalStepTypeEl = document.getElementById("nodeModalStepType");
const nodeModalStatusEl = document.getElementById("nodeModalStatus");
const nodeGuardAllowBtn = document.getElementById("nodeGuardAllowBtn");
const nodeGuardBlockBtn = document.getElementById("nodeGuardBlockBtn");
const nodeGuardPendingBtn = document.getElementById("nodeGuardPendingBtn");
const nodeGuardReasonEl = document.getElementById("nodeGuardReason");
const nodeForkCommandEl = document.getElementById("nodeForkCommand");
const nodeForkNoteEl = document.getElementById("nodeForkNote");
const nodeForkLaunchRuntimeEl = document.getElementById("nodeForkLaunchRuntime");
const nodeForkSessionIdEl = document.getElementById("nodeForkSessionId");
const nodeForkCreateBtn = document.getElementById("nodeForkCreateBtn");
const nodeAuditBtn = document.getElementById("nodeAuditBtn");
const nodeMlBtn = document.getElementById("nodeMlBtn");
const nodeShareTaskEl = document.getElementById("nodeShareTask");
const nodeShareObjectiveEl = document.getElementById("nodeShareObjective");
const nodeShareTagsEl = document.getElementById("nodeShareTags");
const nodeShareBtn = document.getElementById("nodeShareBtn");
const nodeSuggestQueryEl = document.getElementById("nodeSuggestQuery");
const nodeSuggestBtn = document.getElementById("nodeSuggestBtn");
const nodeBriefFocusEl = document.getElementById("nodeBriefFocus");
const nodeBriefBtn = document.getElementById("nodeBriefBtn");
const nodeModalOutputEl = document.getElementById("nodeModalOutput");

const viewPanels = Array.from(document.querySelectorAll("[data-view-panel]"));
const focusButtons = Array.from(document.querySelectorAll(".focus-btn"));

// Chat-first navigation elements
const contextPanelEl = document.getElementById("contextPanel");
const contextPanelBodyEl = document.getElementById("contextPanelBody");
const contextSubTabsEl = document.getElementById("contextSubTabs");
const contextSubRowEl = document.getElementById("contextSubRow");
const contextCloseBtn = document.getElementById("contextCloseBtn");
const panelStorageEl = document.getElementById("panelStorage");
const welcomeStateEl = document.getElementById("welcomeState");
const categoryPills = Array.from(document.querySelectorAll(".category-pill"));
const categoryIndicatorEl = document.querySelector(".category-indicator");
const topBarEl = document.querySelector(".top-bar");

const sourceBadgeEl = document.getElementById("sourceBadge");
const sourceHintEl = document.getElementById("sourceHint");
const sessionTraceIdEl = document.getElementById("sessionTraceId");
const sessionSessionIdEl = document.getElementById("sessionSessionId");
const sessionLastEventEl = document.getElementById("sessionLastEvent");
const sessionRiskBadgeEl = document.getElementById("sessionRiskBadge");
const liveGuardBadgeEl = document.getElementById("liveGuardBadge");
const liveGuardTextEl = document.getElementById("liveGuardText");
const liveForkBadgeEl = document.getElementById("liveForkBadge");
const liveForkTextEl = document.getElementById("liveForkText");
const liveRiskBadgeEl = document.getElementById("liveRiskBadge");
const liveRiskTextEl = document.getElementById("liveRiskText");
const liveGrowthBadgeEl = document.getElementById("liveGrowthBadge");
const liveGrowthTextEl = document.getElementById("liveGrowthText");
const topologyMapEl = document.getElementById("topologyMap");
const topologyEndpointPopupEl = document.getElementById("topologyEndpointPopup");
const topologyEndpointHostEl = document.getElementById("topologyEndpointHost");
const topologyEndpointStatusEl = document.getElementById("topologyEndpointStatus");
const topologyEndpointApproveBtn = document.getElementById("topologyEndpointApproveBtn");
const topologyEndpointCloseBtn = document.getElementById("topologyEndpointCloseBtn");

// Admin panel DOM refs
const marketplaceProviderSelect = document.getElementById("marketplaceProvider");
const marketplaceSearchInput = document.getElementById("marketplaceSearch");
const marketplaceSearchBtn = document.getElementById("marketplaceSearchBtn");
const marketplaceResultsBody = document.getElementById("marketplaceResultsBody");
const marketplaceConnectedBody = document.getElementById("marketplaceConnectedBody");
const marketplaceToolsBody = document.getElementById("marketplaceToolsBody");
const dispatchToolNameInput = document.getElementById("dispatchToolName");
const dispatchToolArgsInput = document.getElementById("dispatchToolArgs");
const dispatchToolBtn = document.getElementById("dispatchToolBtn");
const dispatchResultEl = document.getElementById("dispatchResult");
const policyTypeSelect = document.getElementById("policyType");
const policyActorSelect = document.getElementById("policyActor");
const policyTraceIdInput = document.getElementById("policyTraceId");
const policySessionIdInput = document.getElementById("policySessionId");
const policyCommandInput = document.getElementById("policyCommand");
const policyUrlInput = document.getElementById("policyUrl");
const policyPromptInput = document.getElementById("policyPrompt");
const policyToolNameInput = document.getElementById("policyToolName");
const policyPreviewBtn = document.getElementById("policyPreviewBtn");
const policyEnforceBtn = document.getElementById("policyEnforceBtn");
const policyResultEl = document.getElementById("policyResult");
const settingsAuthStatusEl = document.getElementById("settingsAuthStatus");
const settingsAuthUserEl = document.getElementById("settingsAuthUser");
const settingsRuntimeStatusEl = document.getElementById("settingsRuntimeStatus");
const settingsRefreshBtn = document.getElementById("settingsRefreshBtn");
const settingsClearHistoryBtn = document.getElementById("settingsClearHistoryBtn");
const settingsActionResultEl = document.getElementById("settingsActionResult");

const firewallQuickPromptButtons = document.querySelectorAll(".welcome-pill[data-firewall-prompt]");
const actionTreeCanvasEl = document.getElementById("actionTreeCanvas");
const timelineBodyEl = document.getElementById("timelineBody");

const traceCountEl = document.getElementById("traceCount");
const traceSearchEl = document.getElementById("traceSearch");
const traceRiskEl = document.getElementById("traceRisk");
const traceSourceEl = document.getElementById("traceSource");
const traceListEl = document.getElementById("traceList");

const selectedTraceInfoEl = document.getElementById("selectedTraceInfo");
const explorerStepListEl = document.getElementById("explorerStepList");
const stepInspectorTitleEl = document.getElementById("stepInspectorTitle");
const stepInspectorSummaryEl = document.getElementById("stepInspectorSummary");
const stepInspectorJsonEl = document.getElementById("stepInspectorJson");

const guardLogEl = document.getElementById("guardLog");
const quarantineBannerEl = document.getElementById("quarantineBanner");

const forkMetaEl = document.getElementById("forkMeta");
const forkOriginalIdEl = document.getElementById("forkOriginalId");
const forkForkedIdEl = document.getElementById("forkForkedId");
const forkStepIndexEl = document.getElementById("forkStepIndex");
const forkDiffBodyEl = document.getElementById("forkDiffBody");

const evidenceSummaryEl = document.getElementById("evidenceSummary");
const evidenceJsonEl = document.getElementById("evidenceJson");

const communityTableBodyEl = document.getElementById("communityTableBody");
const communityCountEl = document.getElementById("communityCount");

const briefSummaryEl = document.getElementById("briefSummary");
const briefJsonEl = document.getElementById("briefJson");
const mcpSnippetEl = document.getElementById("mcpSnippet");

const metricEls = {
  sharedTraces: document.getElementById("sharedTraces"),
  uniqueSignatures: document.getElementById("uniqueSignatures"),
  openclawTraces: document.getElementById("openclawTraces"),
  highRiskDetections: document.getElementById("highRiskDetections"),
};

const TRACE_POLL_MS = 1500;
const METRICS_POLL_MS = 10000;
const authModule = typeof window !== "undefined" ? window.MapleAuth : undefined;
const httpModule = typeof window !== "undefined" ? window.MapleHttp : undefined;
const API_KEY_STORAGE_KEY = authModule?.STORAGE_KEY ?? "maple_judge_api_key";

const state = {
  activeView: "live",
  activeFocus: "full",
  activeCategory: null,
  contextPanelOpen: false,
  selectedTraceId: "",
  selectedStepIndex: null,
  traces: [],
  currentTrace: null,
  currentForkContext: null,
  firewallContext: null,
  communityTraces: [],
  communityStats: null,
  ycMetrics: null,
  authenticated: false,
  runtimeStatus: null,
  marketplaceProviders: {},
  marketplaceSearchResults: [],
  marketplaceConnectedApps: [],
  marketplaceTools: [],
};

const CATEGORY_VIEWS = {
  observe: ["timeline", "live"],
  analyze: ["control", "topology"],
  govern:  ["fork", "guard"],
  admin:   ["marketplace", "policy", "settings"],
};

const VIEW_LABELS = {
  live: "Live", timeline: "Timeline", control: "Control",
  topology: "Topology",
  guard: "Guardrails", fork: "Insights",
  marketplace: "Marketplace", policy: "Policy", settings: "Settings",
};

const VIEW_TO_CATEGORY = {};
for (const [cat, views] of Object.entries(CATEGORY_VIEWS)) {
  for (const v of views) VIEW_TO_CATEGORY[v] = cat;
}

const scrollPositions = new Map();

let tracePollTimer = undefined;
let metricsPollTimer = undefined;
let traceRefreshInFlight = false;
let metricsRefreshInFlight = false;
let demoActionInFlight = false;
let firewallChatBusy = false;
let chatHistory = [];
let chatAiEnabled = false;
let nodeModalBusy = false;

let forkCache = {
  forkId: "",
  parentId: "",
  forkTrace: null,
  parentTrace: null,
};

let topologyGraph = null;
let actionTreeGraph = null;

const nodeModalState = {
  traceId: "",
  stepIndex: null,
};

const topologyAllowStore = new Map();

const topologyEndpointState = {
  traceId: "",
  target: "",
};

function setStatus(message, tone = "") {
  if (!(statusEl instanceof HTMLElement)) {
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (tone) {
    statusEl.classList.add(tone);
  }
  statusEl.classList.toggle("hidden", tone === "ok" || !String(message ?? "").trim());
}

function setDemoResult(message, tone = "") {
  if (!demoResultEl) {
    return;
  }

  demoResultEl.textContent = message;
  demoResultEl.classList.remove("ok", "error");
  if (tone) {
    demoResultEl.classList.add(tone);
  }
}

function setDemoButtonsDisabled(disabled) {
  for (const button of [demoStartBtn, demoAuditBtn, demoBlockBtn, demoForkBtn, demoFullBtn]) {
    if (button instanceof HTMLButtonElement) {
      button.disabled = disabled;
    }
  }
}

function setInjectResult(message, tone = "") {
  if (!injectResultEl) {
    return;
  }
  injectResultEl.textContent = message;
  injectResultEl.classList.remove("ok", "error");
  if (tone) {
    injectResultEl.classList.add(tone);
  }
}

function setNodeModalStatus(message, tone = "") {
  if (!nodeModalStatusEl) {
    return;
  }
  nodeModalStatusEl.textContent = message;
  nodeModalStatusEl.classList.remove("ok", "error");
  if (tone) {
    nodeModalStatusEl.classList.add(tone);
  }
}

function setNodeModalButtonsDisabled(disabled) {
  for (const button of [
    nodeGuardAllowBtn,
    nodeGuardBlockBtn,
    nodeGuardPendingBtn,
    nodeForkCreateBtn,
    nodeAuditBtn,
    nodeMlBtn,
    nodeShareBtn,
    nodeSuggestBtn,
    nodeBriefBtn,
  ]) {
    if (button instanceof HTMLButtonElement) {
      button.disabled = disabled;
    }
  }
}

function setNodeModalOutput(payload, label = "") {
  if (!nodeModalOutputEl) {
    return;
  }
  const body =
    label && payload && typeof payload === "object"
      ? {
          action: label,
          at: new Date().toISOString(),
          result: payload,
        }
      : payload ?? {};
  nodeModalOutputEl.textContent = JSON.stringify(body, null, 2);
}

function setPollState(stateKey, message) {
  if (pollDotEl instanceof HTMLElement) {
    pollDotEl.classList.remove("live", "error");
    if (stateKey === "live") {
      pollDotEl.classList.add("live");
    }
    if (stateKey === "error") {
      pollDotEl.classList.add("error");
    }
  }
  if (pollStateEl instanceof HTMLElement) {
    pollStateEl.textContent = message;
  }
}

function resolveApiKeyFromSession() {
  if (authModule?.resolveApiKeyFromSession) {
    return authModule.resolveApiKeyFromSession();
  }
  const sessionKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
  if (typeof sessionKey === "string" && sessionKey.trim()) {
    return sessionKey.trim();
  }
  const localKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (typeof localKey === "string" && localKey.trim()) {
    const normalized = localKey.trim();
    sessionStorage.setItem(API_KEY_STORAGE_KEY, normalized);
    return normalized;
  }
  return "";
}

function headersWithKey() {
  if (authModule?.headersWithKey) {
    return authModule.headersWithKey();
  }
  const key = resolveApiKeyFromSession();
  if (!key) {
    return {};
  }
  return { "x-api-key": key };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trim(value, maxLength = 120) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function shortId(value, size = 8) {
  const text = String(value ?? "");
  if (!text) {
    return "-";
  }
  return text.length <= size ? text : text.slice(0, size);
}

function parseUrlHost(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function toSingleLine(value) {
  return String(value ?? "")
    .replaceAll("\n", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTimestamp(value) {
  if (!value || typeof value !== "string") {
    return "-";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return value;
  }
  return timestamp.toLocaleString();
}

function formatNumber(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return "-";
  }
  return numeric.toLocaleString();
}

function setMetric(el, value) {
  if (!el) {
    return;
  }
  el.textContent = formatNumber(value);
}

function riskLevel(score) {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 60) {
    return "high";
  }
  if (score >= 35) {
    return "medium";
  }
  return "low";
}

function riskClass(score) {
  return `risk-${riskLevel(score)}`;
}

function guardClass(action) {
  if (action === "block" || action === "allow") {
    return action;
  }
  return "";
}

function sourceHint(trace) {
  if (!trace) {
    return "No trace loaded yet.";
  }

  if (trace.source === "mock") {
    const mode = trace.metadata?.mode ? `mode=${trace.metadata.mode}` : "mock fallback mode";
    return `source=mock (${mode}). This run is simulated.`;
  }

  if (trace.source === "openclaw") {
    return "source=openclaw. Live bridge events are being observed.";
  }

  return `source=${trace.source}.`;
}

function stepCommandOrUrl(step) {
  if (step.command) {
    return step.command;
  }
  if (step.externalUrl) {
    return step.externalUrl;
  }
  if (step.toolCall?.name) {
    return `tool:${step.toolCall.name}`;
  }
  if (step.prompt) {
    return step.prompt;
  }
  if (step.output) {
    return step.output;
  }
  return "-";
}

function stepTreeSummary(step) {
  if (step.command) {
    return trim(step.command, 54);
  }
  if (step.externalUrl) {
    return trim(step.externalUrl, 54);
  }
  if (step.toolCall?.name) {
    return trim(`tool:${step.toolCall.name}`, 54);
  }
  if (step.prompt) {
    return trim(step.prompt, 54);
  }
  if (step.output) {
    return trim(step.output, 54);
  }
  return `${step.actor}:${step.type}`;
}

/* ── Graph shared utilities ── */

const TOPO_NODE_COLORS = {
  fixed:    { bg: "#2a2520",   border: "#e8740c", font: "#f0e6d8", sub: "#b4a596" },
  blocked:  { bg: "#3d1f1f",   border: "#cf5e5e", font: "#f5d0d0", sub: "#cf9e9e" },
  allowed:  { bg: "#1a3329",   border: "#39a36f", font: "#c8f0dc", sub: "#7ec4a0" },
  observed: { bg: "#2c2824",   border: "#a89888", font: "#e8ddd0", sub: "#b4a596" },
};

const TREE_NODE_COLORS = {
  low:      { bg: "#1a3329",   border: "#39a36f", font: "#c8f0dc", sub: "#7ec4a0" },
  medium:   { bg: "#3a2a18",   border: "#e09f55", font: "#f5e0c0", sub: "#d4a868" },
  high:     { bg: "#3a1f2a",   border: "#d67695", font: "#f5d0dd", sub: "#d68aa5" },
  critical: { bg: "#3d1525",   border: "#ef6b8b", font: "#ffd0dd", sub: "#ef8faa" },
};

/* ── Cytoscape stylesheets ── */

const ACTION_TREE_STYLE = [
  { selector: 'node', style: {
    'shape': 'roundrectangle', 'width': 240, 'height': 72,
    'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 220,
    'text-valign': 'center', 'text-halign': 'center',
    'font-family': "'Space Grotesk', Arial, sans-serif",
    'font-size': 10, 'font-weight': 500, 'line-height': 1.4, 'border-width': 2, 'border-style': 'solid',
    'background-color': '#1a3a1a', 'border-color': '#2ecc40', 'color': '#c8f0c8',
    'padding': '6px',
  }},
  { selector: 'node.blocked', style: { 'background-color': '#3d1515', 'border-color': '#e74c3c', 'color': '#f5d0d0', 'border-width': 3 }},
  { selector: 'node.selected', style: { 'border-color': '#e8740c', 'border-width': 3 }},
  { selector: 'node.fork', style: { 'background-color': '#152535', 'border-color': '#3498db', 'color': '#c8ddf0', 'width': 220 }},
  { selector: 'edge.main-edge', style: { 'width': 2, 'line-color': 'rgba(46,204,64,0.5)', 'target-arrow-color': '#2ecc40', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'curve-style': 'bezier', 'line-style': 'dashed', 'line-dash-pattern': [8, 4], 'line-dash-offset': 0 }},
  { selector: 'edge.fork-edge', style: { 'width': 2, 'line-color': 'rgba(52,152,219,0.6)', 'target-arrow-color': '#3498db', 'target-arrow-shape': 'triangle', 'curve-style': 'unbundled-bezier', 'control-point-distances': [40], 'control-point-weights': [0.5], 'line-style': 'dashed', 'line-dash-pattern': [8, 4], 'line-dash-offset': 0 }},
];

const TOPOLOGY_STYLE = [
  { selector: 'node', style: {
    'shape': 'roundrectangle', 'width': 200, 'height': 52,
    'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 180,
    'text-valign': 'center', 'text-halign': 'center',
    'font-family': "'Space Grotesk', Arial, sans-serif",
    'font-size': 11, 'font-weight': 600, 'border-width': 2, 'border-style': 'solid',
    'background-color': '#2a2015', 'border-color': '#e8740c', 'color': '#f0e0c8',
  }},
  { selector: 'node.fixed', style: { 'background-color': '#2a2015', 'border-color': '#e8740c', 'color': '#f0e0c8', 'border-width': 3, 'width': 170 }},
  { selector: 'node.blocked', style: { 'background-color': '#3d1515', 'border-color': '#e74c3c', 'color': '#f5d0d0' }},
  { selector: 'node.allowed', style: { 'background-color': '#1a3a1a', 'border-color': '#2ecc40', 'color': '#c8f0c8' }},
  { selector: 'edge.core-edge', style: { 'width': 2.5, 'line-color': 'rgba(232,116,12,0.6)', 'target-arrow-color': '#e8740c', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'line-style': 'dashed', 'line-dash-pattern': [8, 4], 'line-dash-offset': 0 }},
  { selector: 'edge.surface-edge', style: { 'width': 2, 'line-color': 'rgba(232,116,12,0.4)', 'target-arrow-color': 'rgba(232,116,12,0.6)', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'line-style': 'dashed', 'line-dash-pattern': [8, 4], 'line-dash-offset': 0 }},
  { selector: 'edge.surface-edge.blocked', style: { 'line-color': 'rgba(231,76,60,0.8)', 'target-arrow-color': '#e74c3c' }},
  { selector: 'edge.surface-edge.allowed', style: { 'line-color': 'rgba(46,204,64,0.6)', 'target-arrow-color': '#2ecc40' }},
];

/* ── Cytoscape diff-update helper ── */

function patchCyGraph(cy, newNodes, newEdges, fitPadding) {
  const prevIds = new Set();
  cy.nodes().forEach((n) => prevIds.add(n.id()));

  const newNodeIds = new Set(newNodes.map((n) => n.data.id));
  const newEdgeIds = new Set(newEdges.map((e) => e.data.id));

  // Remove stale elements
  cy.elements().forEach((ele) => {
    if (ele.isNode() && !newNodeIds.has(ele.id())) ele.remove();
    if (ele.isEdge() && !newEdgeIds.has(ele.id())) ele.remove();
  });

  // Add or update nodes
  for (const spec of newNodes) {
    const existing = cy.getElementById(spec.data.id);
    if (existing.length) {
      // Update data, classes, position
      existing.data(spec.data);
      existing.classes(spec.classes || '');
      if (spec.position) existing.position(spec.position);
    } else {
      cy.add(spec);
    }
  }

  // Add or update edges
  for (const spec of newEdges) {
    const existing = cy.getElementById(spec.data.id);
    if (existing.length) {
      existing.data(spec.data);
      existing.classes(spec.classes || '');
    } else {
      cy.add(spec);
    }
  }

  // Only fit when the node set changed (new nodes appeared or were removed)
  if (newNodeIds.size !== prevIds.size || [...newNodeIds].some((id) => !prevIds.has(id))) {
    cy.layout({ name: 'preset', fit: false }).run();
    cy.fit(undefined, fitPadding);
  }
}

/* ── Edge flow animation ── */

let edgeFlowOffset = 0;
let edgeFlowRaf = null;

function tickEdgeFlow() {
  edgeFlowOffset = (edgeFlowOffset - 1) % 1000;
  if (actionTreeGraph) {
    actionTreeGraph.edges().style('line-dash-offset', edgeFlowOffset);
  }
  if (topologyGraph) {
    topologyGraph.edges().style('line-dash-offset', edgeFlowOffset);
  }
  edgeFlowRaf = requestAnimationFrame(tickEdgeFlow);
}

function startEdgeFlow() {
  if (!edgeFlowRaf) {
    edgeFlowRaf = requestAnimationFrame(tickEdgeFlow);
  }
}

function stopEdgeFlow() {
  if (edgeFlowRaf) {
    cancelAnimationFrame(edgeFlowRaf);
    edgeFlowRaf = null;
  }
}

/* ── Graph resize handling ── */

function setupGraphResizeObserver(containerEl, graphInstance) {
  if (!containerEl || !graphInstance) return;
  const ro = new ResizeObserver(() => {
    graphInstance.resize();
  });
  ro.observe(containerEl);
}

function storedTopologyAllows(traceId) {
  const key = String(traceId ?? "");
  if (!key) {
    return new Map();
  }
  const existing = topologyAllowStore.get(key);
  return existing instanceof Map ? existing : new Map();
}

function setTopologyAllow(traceId, target) {
  const key = String(traceId ?? "");
  const normalizedTarget = String(target ?? "").trim().toLowerCase();
  if (!key || !normalizedTarget) {
    return;
  }
  const entries = new Map(storedTopologyAllows(key));
  entries.set(normalizedTarget, new Date().toISOString());
  topologyAllowStore.set(key, entries);
}

function updateTopologyEndpointStatus(value = "observed") {
  if (!topologyEndpointStatusEl) {
    return;
  }
  const normalized =
    value === "blocked" || value === "allowed" || value === "observed" ? value : "observed";
  topologyEndpointStatusEl.textContent = normalized === "observed" ? "pending" : normalized;
  topologyEndpointStatusEl.classList.remove("blocked", "allowed", "observed");
  topologyEndpointStatusEl.classList.add(normalized);
}

function closeTopologyEndpointPopup() {
  if (!topologyEndpointPopupEl) {
    return;
  }
  topologyEndpointPopupEl.classList.add("hidden");
  topologyEndpointState.traceId = "";
  topologyEndpointState.target = "";
}

function positionTopologyEndpointPopupAt(screenX, screenY) {
  if (!topologyMapEl || !topologyEndpointPopupEl) {
    return;
  }

  const mapRect = topologyMapEl.getBoundingClientRect();
  const popupWidth = topologyEndpointPopupEl.offsetWidth || 300;
  const popupHeight = topologyEndpointPopupEl.offsetHeight || 164;

  let left = screenX - mapRect.left + 14;
  let top = screenY - mapRect.top - 6;

  const containerW = topologyMapEl.clientWidth;
  const containerH = topologyMapEl.clientHeight;
  left = clamp(left, 12, Math.max(12, containerW - popupWidth - 12));
  top = clamp(top, 12, Math.max(12, containerH - popupHeight - 12));

  topologyEndpointPopupEl.style.left = `${left}px`;
  topologyEndpointPopupEl.style.top = `${top}px`;
}

function openTopologyEndpointPopup({ target = "", status = "observed", screenX = 0, screenY = 0 }) {
  if (!topologyEndpointPopupEl || !topologyEndpointHostEl || !state.currentTrace?.id) {
    return;
  }

  const rawTarget = String(target ?? "").trim();
  if (!rawTarget) {
    return;
  }

  topologyEndpointState.traceId = String(state.currentTrace.id);
  topologyEndpointState.target = rawTarget;
  topologyEndpointHostEl.textContent = rawTarget;
  updateTopologyEndpointStatus(status);
  topologyEndpointPopupEl.classList.remove("hidden");

  positionTopologyEndpointPopupAt(screenX, screenY);
}

function refreshTopologyEndpointPopupAnchor() {
  if (
    !topologyEndpointPopupEl ||
    topologyEndpointPopupEl.classList.contains("hidden")
  ) {
    return;
  }
  closeTopologyEndpointPopup();
}

async function approveTopologyEndpointSelection() {
  if (!state.currentTrace?.id || !topologyEndpointState.target) {
    return;
  }

  const trace = state.currentTrace;
  const target = topologyEndpointState.target;

  // Find the step(s) that touch this endpoint and pick the last one
  const matchingStep = [...trace.steps].reverse().find((step) => {
    const contact = topologyContactForStep(step);
    return String(contact.target ?? "").trim().toLowerCase() === target.trim().toLowerCase();
  });

  // Persist to backend if we have a matching step
  if (matchingStep) {
    try {
      await postJson("/api/demo/guard", {
        traceId: trace.id,
        stepIndex: matchingStep.index,
        action: "allow",
        reason: `Endpoint approved via topology map: ${target}`,
      });
    } catch (error) {
      setStatus(`Failed to persist endpoint approval: ${parseErrorMessage(error)}`, "error");
    }
  }

  setTopologyAllow(trace.id, target);
  updateTopologyEndpointStatus("allowed");
  renderTopologyMap(trace, state.currentForkContext);
  setStatus(`Approved endpoint ${target}.`, "ok");

  // Refresh to pick up persisted guard action
  refreshTracePanels({ silent: true }).catch(() => {});
}

function updateMcpSnippet() {
  if (!(mcpSnippetEl instanceof HTMLElement)) {
    return;
  }
  const key = resolveApiKeyFromSession();
  const baseUrl = window.location.origin;
  const headerValue = key ? "<session-api-key>" : "<your_api_key>";

  mcpSnippetEl.textContent = [
    `MCP URL: ${baseUrl}/mcp`,
    `Header: x-api-key: ${headerValue}`,
    "",
    "Example JSON-RPC:",
    `curl -X POST ${baseUrl}/mcp \\`,
    '  -H "content-type: application/json" \\',
    `  -H "x-api-key: ${headerValue}" \\`,
    "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'",
  ].join("\n");
}

async function fetchJson(path) {
  if (httpModule?.fetchJson) {
    return httpModule.fetchJson(path);
  }
  const response = await fetch(path, {
    headers: {
      ...headersWithKey(),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.reason ? ` (${payload.reason})` : "";
    throw new Error(`HTTP ${response.status}${reason}`);
  }

  return payload;
}

async function postJson(path, body) {
  if (httpModule?.postJson) {
    return httpModule.postJson(path, body);
  }
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headersWithKey(),
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason =
      typeof payload?.error === "string"
        ? ` (${payload.error})`
        : payload?.reason
          ? ` (${payload.reason})`
          : "";
    throw new Error(`HTTP ${response.status}${reason}`);
  }

  return payload;
}

function setFirewallChatBusy(busy) {
  firewallChatBusy = busy;
  const disabled = Boolean(busy);

  if (firewallChatSendBtn instanceof HTMLButtonElement) {
    firewallChatSendBtn.disabled = disabled;
  }
  if (firewallChatRefreshBtn instanceof HTMLButtonElement) {
    firewallChatRefreshBtn.disabled = disabled;
  }
  if (firewallChatInputEl instanceof HTMLInputElement) {
    firewallChatInputEl.disabled = disabled;
  }
  for (const button of firewallQuickPromptButtons) {
    if (button instanceof HTMLButtonElement) {
      button.disabled = disabled;
    }
  }
}

function setFirewallChatContext(context) {
  if (!(firewallChatContextEl instanceof HTMLElement)) {
    return;
  }

  const trace = context?.trace ?? null;
  const firewall = context?.firewall ?? null;
  if (!trace || !firewall) {
    firewallChatContextEl.textContent = "No active firewall context yet.";
    return;
  }

  const risk = Number(trace.overallRiskScore ?? 0);
  const severity = String(trace.riskSeverity ?? riskLevel(risk));
  firewallChatContextEl.textContent = [
    `trace=${trace.id}`,
    `source=${trace.source}`,
    `status=${trace.status}`,
    `risk=${risk} (${severity})`,
    `blocked=${Number(firewall.blockedSteps ?? 0)}`,
    `redacted=${Number(firewall.redactedSteps ?? 0)}`,
    `last=${formatTimestamp(String(trace.lastEventAt ?? trace.updatedAt ?? ""))}`,
  ].join(" • ");
}

let lastMessageTimestamp = null;

function resetFirewallChatLog(message = "Ask Maple for live firewall updates.") {
  chatHistory = [];
  lastMessageTimestamp = null;
  if (!(firewallChatLogEl instanceof HTMLElement)) {
    return;
  }
  firewallChatLogEl.innerHTML = `<p class="empty-row">${escapeHtml(message)}</p>`;
  updateWelcomeState();
}

function maybeInsertTimestamp(now) {
  if (!(firewallChatLogEl instanceof HTMLElement)) return;
  if (lastMessageTimestamp) {
    const gap = now.getTime() - lastMessageTimestamp.getTime();
    if (gap > 2 * 60 * 1000) {
      const divider = document.createElement("div");
      divider.className = "chat-timestamp";
      divider.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      firewallChatLogEl.appendChild(divider);
    }
  }
  lastMessageTimestamp = now;
}

function clearEmptyPlaceholder() {
  if (!(firewallChatLogEl instanceof HTMLElement)) return;
  if (
    firewallChatLogEl.children.length === 1 &&
    firewallChatLogEl.firstElementChild &&
    firewallChatLogEl.firstElementChild.classList.contains("empty-row")
  ) {
    firewallChatLogEl.innerHTML = "";
  }
}

function appendFirewallChatMessage(role, text, options = {}) {
  if (!(firewallChatLogEl instanceof HTMLElement)) {
    return;
  }

  const rawText = String(text ?? "").trim();
  if (!rawText) {
    return;
  }

  clearEmptyPlaceholder();

  const normalizedRole = role === "user" ? "user" : "assistant";
  const errorClass = options.error ? " error" : "";
  const body = escapeHtml(rawText).replaceAll("\n", "<br>");
  const now = new Date();

  maybeInsertTimestamp(now);

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${normalizedRole}${errorClass}`;
  bubble.innerHTML = body;
  firewallChatLogEl.appendChild(bubble);

  while (firewallChatLogEl.children.length > 80) {
    firewallChatLogEl.removeChild(firewallChatLogEl.firstElementChild);
  }

  firewallChatLogEl.scrollTo({ top: firewallChatLogEl.scrollHeight, behavior: "smooth" });
  updateWelcomeState();
}

function createStreamingBubble() {
  if (!(firewallChatLogEl instanceof HTMLElement)) return null;
  clearEmptyPlaceholder();

  const now = new Date();
  maybeInsertTimestamp(now);

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble assistant streaming";
  bubble.innerHTML = '<div class="typing-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  firewallChatLogEl.appendChild(bubble);
  firewallChatLogEl.scrollTop = firewallChatLogEl.scrollHeight;
  updateWelcomeState();
  return bubble;
}

function updateStreamingBubble(el, content) {
  if (!el) return;
  el.innerHTML = escapeHtml(content).replaceAll("\n", "<br>") + '<span class="streaming-cursor"></span>';
  if (firewallChatLogEl instanceof HTMLElement) {
    firewallChatLogEl.scrollTop = firewallChatLogEl.scrollHeight;
  }
}

function finalizeStreamingBubble(el, content) {
  if (!el) return;
  el.classList.remove("streaming");
  el.innerHTML = escapeHtml(content).replaceAll("\n", "<br>");
}

function updateChatModeBadge() {
  const badge = document.getElementById("chatModeBadge");
  if (!badge) return;
  badge.textContent = chatAiEnabled ? "AI" : "Rules";
  badge.className = `chat-mode-badge ${chatAiEnabled ? "ai" : "rules"}`;
}

async function checkChatCapabilities() {
  try {
    const data = await fetchJson("/api/chat/capabilities");
    chatAiEnabled = Boolean(data?.aiEnabled);
    updateChatModeBadge();
  } catch {
    chatAiEnabled = false;
  }
}

async function loadFirewallState({ silent = false } = {}) {
  if (!state.authenticated && !resolveApiKeyFromSession()) {
    state.firewallContext = null;
    setFirewallChatContext(null);
    return null;
  }

  const traceId = currentTraceId();
  const sessionId =
    state.currentTrace && typeof state.currentTrace.sessionId === "string"
      ? String(state.currentTrace.sessionId)
      : "";
  const query = new URLSearchParams();
  if (traceId) {
    query.set("traceId", traceId);
  } else if (sessionId) {
    query.set("sessionId", sessionId);
  }

  const path = query.toString() ? `/api/firewall/state?${query.toString()}` : "/api/firewall/state";
  try {
    const payload = await fetchJson(path);
    const context = payload?.context ?? null;
    state.firewallContext = context;
    setFirewallChatContext(context);
    return context;
  } catch (error) {
    if (!silent) {
      setStatus(`Failed to load firewall state: ${parseErrorMessage(error)}`, "error");
    }
    throw error;
  }
}

async function askFirewallChat(message, { echoUser = true } = {}) {
  const prompt = String(message ?? "").trim();
  if (!prompt) {
    return;
  }
  if (!state.authenticated && !resolveApiKeyFromSession()) {
    setStatus("Sign in required. Open /landing and sign in.", "error");
    return;
  }
  if (firewallChatBusy) {
    return;
  }

  if (echoUser) {
    appendFirewallChatMessage("user", prompt);
  }
  chatHistory.push({ role: "user", content: prompt });

  setFirewallChatBusy(true);
  let streamingEl = null;
  try {
    const traceId = currentTraceId();
    const sessionId =
      state.currentTrace && typeof state.currentTrace.sessionId === "string"
        ? String(state.currentTrace.sessionId)
        : undefined;

    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersWithKey(),
      },
      body: JSON.stringify({
        messages: chatHistory.slice(-20),
        traceId: traceId || undefined,
        sessionId,
      }),
    });

    if (!response.ok) throw new Error(`Chat failed: ${response.status}`);

    streamingEl = createStreamingBubble();
    let fullContent = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.content) {
            fullContent += parsed.content;
            updateStreamingBubble(streamingEl, fullContent);
          }
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    if (fullContent) {
      finalizeStreamingBubble(streamingEl, fullContent);
      streamingEl = null;
      chatHistory.push({ role: "assistant", content: fullContent });
    } else {
      if (streamingEl && streamingEl.parentNode) streamingEl.parentNode.removeChild(streamingEl);
      streamingEl = null;
    }

    if (chatHistory.length > 40) {
      chatHistory = chatHistory.slice(-30);
    }
  } catch (error) {
    if (streamingEl && streamingEl.parentNode) streamingEl.parentNode.removeChild(streamingEl);
    appendFirewallChatMessage("assistant", `Chat error: ${parseErrorMessage(error)}`, { error: true });
  } finally {
    setFirewallChatBusy(false);
  }
}

async function sendFirewallChatFromInput() {
  if (!(firewallChatInputEl instanceof HTMLInputElement)) {
    return;
  }
  const prompt = firewallChatInputEl.value.trim();
  if (!prompt) {
    return;
  }
  firewallChatInputEl.value = "";
  await askFirewallChat(prompt, { echoUser: true });
}

async function fetchTraceById(traceId) {
  return fetchJson(`/api/trace?traceId=${encodeURIComponent(traceId)}`);
}

function closeNodeModal() {
  if (!nodeActionModalEl) {
    return;
  }
  nodeActionModalEl.classList.add("hidden");
  nodeModalState.traceId = "";
  nodeModalState.stepIndex = null;
  nodeModalBusy = false;
  setNodeModalButtonsDisabled(false);
  setNodeModalOutput({});
}

function openNodeModalWithStep(trace, step) {
  if (!nodeActionModalEl || !step) {
    return;
  }

  nodeModalState.traceId = String(trace.id ?? "");
  nodeModalState.stepIndex = Number(step.index);

  if (nodeModalTraceIdEl) {
    nodeModalTraceIdEl.textContent = String(trace.id ?? "-");
  }
  if (nodeModalSessionIdEl) {
    nodeModalSessionIdEl.textContent = String(trace.sessionId ?? "-");
  }
  if (nodeModalStepIndexEl) {
    nodeModalStepIndexEl.textContent = `#${step.index}`;
  }
  if (nodeModalStepTypeEl) {
    nodeModalStepTypeEl.textContent = `${step.type}/${step.actor}`;
  }

  if (nodeModalSummaryEl) {
    nodeModalSummaryEl.textContent = trim(toSingleLine(stepCommandOrUrl(step) || "-"), 180);
  }

  if (nodeGuardReasonEl instanceof HTMLInputElement) {
    const existingReason =
      typeof step.metadata?.guardReason === "string" ? String(step.metadata.guardReason) : "";
    nodeGuardReasonEl.value = existingReason;
  }

  if (nodeForkCommandEl instanceof HTMLInputElement) {
    nodeForkCommandEl.value = step.command ?? "";
  }
  if (nodeForkNoteEl instanceof HTMLInputElement) {
    nodeForkNoteEl.value = `Forked from step #${step.index} via Maple node modal.`;
  }
  if (nodeForkLaunchRuntimeEl instanceof HTMLInputElement) {
    nodeForkLaunchRuntimeEl.checked = true;
  }
  if (nodeForkSessionIdEl instanceof HTMLInputElement) {
    nodeForkSessionIdEl.value = `${trace.sessionId}-fork-${step.index}-${Date.now().toString(36)}`;
  }

  if (nodeShareTaskEl instanceof HTMLInputElement && !nodeShareTaskEl.value.trim()) {
    nodeShareTaskEl.value = "safe agent workflow";
  }
  if (nodeShareObjectiveEl instanceof HTMLInputElement && !nodeShareObjectiveEl.value.trim()) {
    nodeShareObjectiveEl.value = "prevent risky autonomous actions before execution";
  }
  if (nodeShareTagsEl instanceof HTMLInputElement && !nodeShareTagsEl.value.trim()) {
    nodeShareTagsEl.value = "security,guardrails,openclaw";
  }
  if (nodeSuggestQueryEl instanceof HTMLInputElement && !nodeSuggestQueryEl.value.trim()) {
    nodeSuggestQueryEl.value = "safe inbox triage automation";
  }
  if (nodeBriefFocusEl instanceof HTMLSelectElement) {
    nodeBriefFocusEl.value = "full";
  }

  setNodeModalStatus("Set guard action or create a fork from this step.");
  setNodeModalOutput({
    traceId: trace.id,
    stepIndex: step.index,
    stepType: step.type,
    actor: step.actor,
    currentGuard: step.guardStatus,
  });
  nodeActionModalEl.classList.remove("hidden");
}

async function openNodeModalFromSelection(traceId, stepIndex) {
  if (!traceId || !Number.isFinite(stepIndex)) {
    return;
  }

  try {
    let trace;
    if (state.currentTrace?.id === traceId) {
      trace = state.currentTrace;
    } else {
      trace = await fetchTraceById(traceId);
    }

    const step = trace?.steps?.find((candidate) => candidate.index === stepIndex);
    if (!trace || !step) {
      return;
    }

    openNodeModalWithStep(trace, step);
  } catch (error) {
    const message = parseErrorMessage(error);
    setStatus(`Failed to open node modal: ${message}`, "error");
  }
}

function toggleCategory(category) {
  if (!category || !CATEGORY_VIEWS[category]) return;

  if (state.activeCategory === category && state.contextPanelOpen) {
    closeContextPanel();
    return;
  }

  const defaultView = CATEGORY_VIEWS[category][0];
  openContextPanel(category, defaultView);
}

function openContextPanel(category, subView) {
  if (!category || !CATEGORY_VIEWS[category]) return;
  const views = CATEGORY_VIEWS[category];
  const targetView = views.includes(subView) ? subView : views[0];

  state.activeCategory = category;
  state.contextPanelOpen = true;
  state.activeView = targetView;

  // Build sub-tabs
  if (contextSubTabsEl) {
    contextSubTabsEl.innerHTML = "";
    for (const v of views) {
      const btn = document.createElement("button");
      btn.className = `context-sub-tab${v === targetView ? " is-active" : ""}`;
      btn.type = "button";
      btn.dataset.subView = v;
      btn.textContent = VIEW_LABELS[v] || v;
      contextSubTabsEl.appendChild(btn);
    }
  }

  // Move panel into body
  moveViewPanelToBody(targetView);

  // Update category pills
  for (const pill of categoryPills) {
    const isActive = pill.dataset.category === category;
    pill.classList.toggle("is-active", isActive);
    pill.setAttribute("aria-selected", String(isActive));
  }

  // Animate indicator
  updateSegmentedIndicator(category);

  // Open context panel + hide chat + connect to navbar
  if (contextPanelEl) {
    contextPanelEl.classList.add("is-open");
    contextPanelEl.setAttribute("aria-hidden", "false");
  }
  if (topBarEl) topBarEl.classList.add("panel-connected");
  const chatHomeEl = document.getElementById("chatHome");
  if (chatHomeEl) chatHomeEl.classList.add("panel-active");

  // Hide welcome state while panel is open
  updateWelcomeState();

  // Preserve chat scroll
  preserveChatScroll();

  persistNavState();
}

function closeContextPanel() {
  state.activeCategory = null;
  state.contextPanelOpen = false;

  // Remove active states
  for (const pill of categoryPills) {
    pill.classList.remove("is-active");
    pill.setAttribute("aria-selected", "false");
  }

  updateSegmentedIndicator(null);

  if (contextPanelEl) {
    contextPanelEl.classList.remove("is-open");
    contextPanelEl.setAttribute("aria-hidden", "true");

    // Return panels to storage after transition (only if still closed)
    contextPanelEl.addEventListener("transitionend", () => {
      if (!state.contextPanelOpen) {
        returnAllPanelsToStorage();
      }
    }, { once: true });
  }

  // Restore chat + disconnect navbar
  if (topBarEl) topBarEl.classList.remove("panel-connected");
  const chatHomeEl = document.getElementById("chatHome");
  if (chatHomeEl) chatHomeEl.classList.remove("panel-active");

  // Restore welcome state if no messages
  updateWelcomeState();

  preserveChatScroll();
  persistNavState();
}

function setSubView(subView) {
  if (!state.activeCategory || !state.contextPanelOpen) return;
  const views = CATEGORY_VIEWS[state.activeCategory];
  if (!views || !views.includes(subView)) return;

  // Save scroll of current view
  const currentPanel = contextPanelBodyEl?.querySelector(".view-panel");
  if (currentPanel) {
    const viewName = currentPanel.dataset.viewPanel;
    if (viewName) scrollPositions.set(viewName, currentPanel.scrollTop);
  }

  state.activeView = subView;

  // Update sub-tabs
  if (contextSubTabsEl) {
    for (const tab of contextSubTabsEl.children) {
      tab.classList.toggle("is-active", tab.dataset.subView === subView);
    }
  }

  moveViewPanelToBody(subView);
  persistNavState();
}

function moveViewPanelToBody(viewName) {
  if (!contextPanelBodyEl || !panelStorageEl) return;

  // Return current panel to storage
  const currentPanel = contextPanelBodyEl.querySelector(".view-panel");
  if (currentPanel) {
    const curName = currentPanel.dataset.viewPanel;
    if (curName) scrollPositions.set(curName, currentPanel.scrollTop);
    currentPanel.classList.add("hidden");
    panelStorageEl.appendChild(currentPanel);
  }

  // Move target panel in
  const target = panelStorageEl.querySelector(`[data-view-panel="${viewName}"]`);
  if (!target) return;

  target.classList.remove("hidden");
  contextPanelBodyEl.appendChild(target);

  // Restore scroll
  if (scrollPositions.has(viewName)) {
    target.scrollTop = scrollPositions.get(viewName);
  }

  // View entering animation
  target.classList.add("view-entering");
  target.addEventListener("animationend", () => target.classList.remove("view-entering"), { once: true });

  // Handle graph views that need resize after DOM relocation
  if (viewName === "live" && actionTreeGraph) {
    setTimeout(() => {
      actionTreeGraph.resize();
      actionTreeGraph.fit();
    }, 200);
  } else if (viewName === "live" && actionTreeCanvasEl?._pendingGraphData) {
    setTimeout(() => {
      const pending = actionTreeCanvasEl._pendingGraphData;
      actionTreeCanvasEl._pendingGraphData = null;
      renderActionTree(pending.trace, pending.forkContext);
    }, 100);
  }

  if (viewName === "topology" && topologyGraph) {
    setTimeout(() => {
      topologyGraph.resize();
      topologyGraph.fit();
    }, 200);
  } else if (viewName === "topology" && topologyMapEl?._pendingGraphData) {
    setTimeout(() => {
      const pending = topologyMapEl._pendingGraphData;
      topologyMapEl._pendingGraphData = null;
      renderTopologyMap(pending.trace, pending.forkContext);
    }, 100);
  }

  if (viewName !== "topology") {
    closeTopologyEndpointPopup();
  }
}

function returnAllPanelsToStorage() {
  if (!contextPanelBodyEl || !panelStorageEl) return;
  const panels = contextPanelBodyEl.querySelectorAll(".view-panel");
  for (const panel of panels) {
    panel.classList.add("hidden");
    panelStorageEl.appendChild(panel);
  }
}

function updateSegmentedIndicator(category) {
  if (!categoryIndicatorEl) return;

  if (!category) {
    categoryIndicatorEl.classList.remove("is-active");
    return;
  }

  // Find the pill index from actual DOM order (not hardcoded)
  const pills = categoryPills;
  if (pills.length === 0) return;

  const index = pills.findIndex(p => p.dataset.category === category);
  if (index < 0) return;

  categoryIndicatorEl.classList.add("is-active");

  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += pills[i].offsetWidth;
  }
  const targetWidth = pills[index].offsetWidth;

  categoryIndicatorEl.style.width = `${targetWidth}px`;
  categoryIndicatorEl.style.transform = `translateX(${offset}px)`;
}

function updateWelcomeState() {
  if (!welcomeStateEl || !firewallChatLogEl) return;

  const hasMessages = firewallChatLogEl.children.length > 0 &&
    !(firewallChatLogEl.children.length === 1 &&
      firewallChatLogEl.firstElementChild?.classList.contains("empty-row"));

  // Hide welcome when there are messages OR when the context panel is open
  const shouldHide = hasMessages || state.contextPanelOpen;
  welcomeStateEl.classList.toggle("is-hidden", shouldHide);
}

function preserveChatScroll() {
  if (!firewallChatLogEl) return;
  const isAtBottom = firewallChatLogEl.scrollHeight - firewallChatLogEl.scrollTop - firewallChatLogEl.clientHeight < 20;
  if (isAtBottom) {
    requestAnimationFrame(() => {
      firewallChatLogEl.scrollTop = firewallChatLogEl.scrollHeight;
    });
  }
}

function persistNavState() {
  if (state.activeCategory && state.contextPanelOpen) {
    const hashVal = `${state.activeCategory}/${state.activeView}`;
    localStorage.setItem("maple_judge_view", hashVal);
    if (window.location.hash !== `#${hashVal}`) {
      window.history.replaceState(null, "", `#${hashVal}`);
    }
  } else {
    localStorage.setItem("maple_judge_view", "");
    if (window.location.hash !== "") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }
}

function restoreNavState() {
  // Only restore from URL hash (explicit navigation), not localStorage
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;

  // Handle new format: "observe/live"
  if (hash.includes("/")) {
    const [cat, view] = hash.split("/");
    if (CATEGORY_VIEWS[cat]) {
      openContextPanel(cat, view);
      return;
    }
  }

  // Handle legacy single-view hashes
  const mappedView =
    hash === "operations" ? "live"
    : hash === "explorer" ? "evidence"
    : hash === "replay" ? "guard"
    : hash === "chat" ? null
    : hash;

  if (!mappedView) return;

  const category = VIEW_TO_CATEGORY[mappedView];
  if (category) {
    openContextPanel(category, mappedView);
  }
}

// Legacy wrapper
function setView(nextView) {
  if (!nextView) return;
  const mappedView =
    nextView === "operations" ? "live"
    : nextView === "explorer" ? "evidence"
    : nextView === "replay" ? "guard"
    : nextView;

  const category = VIEW_TO_CATEGORY[mappedView];
  if (category) {
    toggleCategory(category);
    setSubView(mappedView);
  }
}

function setFocus(nextFocus) {
  state.activeFocus = nextFocus;
  for (const button of focusButtons) {
    button.classList.toggle("is-active", button.dataset.focus === nextFocus);
  }

  if (state.authenticated || resolveApiKeyFromSession()) {
    loadYcBrief().catch((error) => handleRefreshError("refresh YC brief", error, false));
  }
}

function renderSessionStrip(trace) {
  const lastStep = trace.steps[trace.steps.length - 1];
  const overallRiskScore = Number(
    trace.metadata?.overallRiskScore ??
      Math.max(0, ...trace.steps.map((step) => Number(step.riskScore ?? 0)))
  );

  sessionTraceIdEl.textContent = trace.id;
  sessionSessionIdEl.textContent = trace.sessionId;
  sessionLastEventEl.textContent = formatTimestamp(lastStep?.timestamp ?? trace.updatedAt);
  sessionRiskBadgeEl.className = `risk-badge ${riskClass(overallRiskScore)}`;
  sessionRiskBadgeEl.textContent = `${overallRiskScore} (${riskLevel(overallRiskScore)})`;

  sourceBadgeEl.className = `source-badge source-${trace.source}`;
  sourceBadgeEl.textContent = `source=${trace.source}`;
  sourceHintEl.textContent = sourceHint(trace);
  sourceHintEl.classList.toggle("mock", trace.source === "mock");
}

function rowRiskClass(step) {
  if (step.riskScore >= 80) {
    return "is-critical";
  }
  if (step.riskScore >= 60) {
    return "is-high";
  }
  if (step.riskScore >= 35) {
    return "is-medium";
  }
  return "";
}

function rowClasses(step) {
  const classes = [];
  const risk = rowRiskClass(step);
  if (risk) {
    classes.push(risk);
  }
  if (step.guardStatus === "block") {
    classes.push("is-blocked");
  }
  return classes.join(" ");
}

function renderTimeline(trace) {
  if (!trace.steps.length) {
    timelineBodyEl.innerHTML = '<tr><td colspan="6" class="empty-row">No events yet.</td></tr>';
    return;
  }

  timelineBodyEl.innerHTML = trace.steps
    .map((step) => {
      const signal =
        step.riskFlags?.length > 0
          ? step.riskFlags
              .map((flag) => flag.type)
              .slice(0, 2)
              .join(", ")
          : "no flags";

      const isSelected = state.selectedStepIndex === step.index ? " is-active" : "";

      return `<tr class="${rowClasses(step)}${isSelected}" data-step-index="${escapeHtml(step.index)}">
        <td>#${escapeHtml(step.index)}</td>
        <td>${escapeHtml(step.actor)}</td>
        <td>${escapeHtml(step.type)}</td>
        <td>
          <div>${escapeHtml(trim(stepCommandOrUrl(step), 140))}</div>
          <div class="step-signal">${escapeHtml(signal)}</div>
        </td>
        <td><span class="risk-badge ${riskClass(step.riskScore)}">${escapeHtml(step.riskScore)} (${escapeHtml(riskLevel(step.riskScore))})</span></td>
        <td><span class="guard-pill ${guardClass(step.guardStatus)}">${escapeHtml(step.guardStatus)}</span></td>
      </tr>`;
    })
    .join("");
}

/* ── Action tree graph data builder ── */

function buildActionTreeGraphData(trace, forkContext) {
  const nodes = [];
  const edges = [];

  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    return { nodes, edges };
  }

  const ySpacing = 100;
  const xOffset = 280;

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    const stepIndex = Number(step.index ?? i);
    const actor = step.actor ?? "agent";
    const type = step.type ?? "event";
    const rs = Number(step.riskScore ?? 0);
    const gs = step.guardStatus ?? "pending";
    const isSelected = state.selectedStepIndex === stepIndex;
    const risk = riskLevel(rs);

    const classes = ["main", risk];
    if (gs === "block") classes.push("blocked");
    if (isSelected) classes.push("selected");

    const guardLabel = gs === "pending" ? "" : `  [${gs.toUpperCase()}]`;
    const summary = stepTreeSummary(step);
    const label = `#${stepIndex}  ${type} · ${actor}${guardLabel}\n${summary}\nrisk ${rs} · ${risk}`;

    nodes.push({ data: { id: "main_" + i, stepIndex, label, traceId: trace.id }, position: { x: 0, y: i * ySpacing }, classes: classes.join(" ") });

    if (i > 0) {
      edges.push({ data: { id: `main_${i - 1}__main_${i}`, source: "main_" + (i - 1), target: "main_" + i }, classes: "main-edge" });
    }
  }

  if (forkContext?.forkTrace) {
    const forkTrace = forkContext.forkTrace;
    const forkFromStep = Number(forkTrace.forkedFromStep ?? 0);
    const clampedForkFrom = Number.isFinite(forkFromStep)
      ? Math.max(0, Math.min(forkFromStep, trace.steps.length - 1))
      : 0;
    const forkSteps = forkTrace.steps.length > clampedForkFrom
      ? forkTrace.steps.slice(clampedForkFrom)
      : forkTrace.steps;

    for (let i = 0; i < forkSteps.length; i++) {
      const step = forkSteps[i];
      const stepIndex = Number(step.index ?? (clampedForkFrom + i));
      const actor = step.actor ?? "agent";
      const type = step.type ?? "event";
      const rs = Number(step.riskScore ?? 0);
      const gs = step.guardStatus ?? "pending";
      const isSelected = state.selectedStepIndex === stepIndex;
      const risk = riskLevel(rs);

      const classes = ["fork", risk];
      if (gs === "block") classes.push("blocked");
      if (isSelected) classes.push("selected");

      const guardLabel = gs === "pending" ? "" : `  [${gs.toUpperCase()}]`;
      const summary = stepTreeSummary(step);
      const label = `Fork #${stepIndex}  ${type} · ${actor}${guardLabel}\n${summary}\nrisk ${rs} · ${risk}`;

      nodes.push({ data: { id: "fork_" + i, stepIndex, label, traceId: forkTrace.id }, position: { x: xOffset, y: (clampedForkFrom + i) * ySpacing }, classes: classes.join(" ") });

      if (i === 0) {
        edges.push({ data: { id: `main_${clampedForkFrom}__fork_0`, source: "main_" + clampedForkFrom, target: "fork_0" }, classes: "fork-edge" });
      } else {
        edges.push({ data: { id: `fork_${i - 1}__fork_${i}`, source: "fork_" + (i - 1), target: "fork_" + i }, classes: "fork-edge" });
      }
    }
  }

  return { nodes, edges };
}

/* ── Graph init functions ── */

function initActionTreeGraph() {
  if (actionTreeGraph) return;
  if (!actionTreeCanvasEl || actionTreeCanvasEl.clientWidth === 0 || actionTreeCanvasEl.clientHeight === 0) return;
  if (typeof cytoscape === "undefined") {
    actionTreeCanvasEl.innerHTML = '<div class="action-tree-empty"><p>Graph library failed to load.</p></div>';
    return;
  }

  actionTreeCanvasEl.innerHTML = "";

  try {
    actionTreeGraph = cytoscape({
      container: actionTreeCanvasEl,
      elements: [],
      style: ACTION_TREE_STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    actionTreeGraph.on('tap', 'node', (evt) => handleActionTreeNodeClick(evt.target.data()));
    actionTreeGraph.on('mouseover', 'node', () => { actionTreeCanvasEl.style.cursor = 'pointer'; });
    actionTreeGraph.on('mouseout', 'node', () => { actionTreeCanvasEl.style.cursor = 'default'; });
    setupGraphResizeObserver(actionTreeCanvasEl, actionTreeGraph);
    startEdgeFlow();
  } catch (err) {
    console.error("Failed to initialize action tree graph:", err);
    actionTreeGraph = null;
    actionTreeCanvasEl.innerHTML = '<div class="action-tree-empty"><p>Graph failed to initialize.</p></div>';
  }
}

async function handleActionTreeNodeClick(node) {
  if (!node) return;
  const stepIndex = node.stepIndex;
  if (!Number.isFinite(stepIndex)) return;

  const traceId = node.traceId || state.selectedTraceId || "";
  state.selectedStepIndex = stepIndex;

  if (traceId && traceId !== state.selectedTraceId) {
    state.selectedTraceId = traceId;
    await refreshTracePanels({ silent: true }).catch((error) =>
      handleRefreshError("select tree step", error, false)
    );
  } else if (state.currentTrace) {
    await refreshTracePanels({ silent: true }).catch((error) =>
      handleRefreshError("select tree step", error, false)
    );
  }

  const modalTraceId = traceId || state.selectedTraceId || currentTraceId();
  await openNodeModalFromSelection(modalTraceId, stepIndex);
}

function renderActionTree(trace, forkContext = null) {
  if (!actionTreeCanvasEl) {
    return;
  }

  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    if (actionTreeGraph) {
      actionTreeGraph.elements().remove();
    } else {
      actionTreeCanvasEl.innerHTML = '<div class="action-tree-empty">' + LOADING_KIRBY_SVG + '<p>No trace loaded.</p></div>';
    }
    return;
  }

  if (!actionTreeGraph) {
    initActionTreeGraph();
    if (!actionTreeGraph) {
      actionTreeCanvasEl._pendingGraphData = { trace, forkContext };
      return;
    }
  }

  const data = buildActionTreeGraphData(trace, forkContext);
  patchCyGraph(actionTreeGraph, data.nodes, data.edges, 30);
}

function collectGuardActions(trace) {
  return trace.steps
    .map((step) => {
      const reason =
        typeof step.metadata?.guardReason === "string" ? step.metadata.guardReason : "No reason provided.";
      const updatedAt =
        typeof step.metadata?.guardUpdatedAt === "string" ? step.metadata.guardUpdatedAt : step.timestamp;
      const isAction = step.guardStatus !== "pending" || Boolean(step.metadata?.guardUpdatedAt);

      return {
        isAction,
        stepIndex: step.index,
        action: step.guardStatus,
        reason,
        updatedAt,
      };
    })
    .filter((entry) => entry.isAction)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

function resetLiveActionStrip() {
  if (liveGuardBadgeEl) {
    liveGuardBadgeEl.textContent = "idle";
  }
  if (liveGuardTextEl) {
    liveGuardTextEl.textContent = "No guard action yet.";
  }

  if (liveForkBadgeEl) {
    liveForkBadgeEl.textContent = "none";
  }
  if (liveForkTextEl) {
    liveForkTextEl.textContent = "No fork branch detected.";
  }

  if (liveRiskBadgeEl) {
    liveRiskBadgeEl.className = "risk-badge risk-low";
    liveRiskBadgeEl.textContent = "0 (low)";
  }
  if (liveRiskTextEl) {
    liveRiskTextEl.textContent = "0 flags across 0 steps.";
  }

  if (liveGrowthBadgeEl) {
    liveGrowthBadgeEl.textContent = "0 shared";
  }
  if (liveGrowthTextEl) {
    liveGrowthTextEl.textContent = "No shared traces yet.";
  }
}

function renderLiveActionStrip(trace, forkContext = null) {
  if (!trace) {
    resetLiveActionStrip();
    return;
  }

  const guardActions = collectGuardActions(trace);
  const lastGuard = guardActions.length > 0 ? guardActions[guardActions.length - 1] : null;
  if (liveGuardBadgeEl) {
    liveGuardBadgeEl.textContent = lastGuard ? String(lastGuard.action) : "pending";
  }
  if (liveGuardTextEl) {
    liveGuardTextEl.textContent = lastGuard
      ? `Step #${lastGuard.stepIndex} • ${trim(lastGuard.reason, 64)}`
      : "No guard decision applied yet.";
  }

  const forkTrace =
    forkContext?.forkTrace ??
    (trace.parentTraceId ? trace : null) ??
    state.traces.find((candidate) => candidate.parentTraceId && candidate.parentTraceId === trace.id) ??
    null;

  const forkId =
    forkTrace && typeof forkTrace === "object"
      ? String(forkTrace.id ?? forkTrace.traceId ?? "")
      : "";
  const forkStep =
    forkTrace && typeof forkTrace === "object"
      ? Number(forkTrace.forkedFromStep ?? forkTrace.forkStepIndex ?? 0)
      : NaN;

  if (liveForkBadgeEl) {
    liveForkBadgeEl.textContent = forkId ? "active" : "none";
  }
  if (liveForkTextEl) {
    liveForkTextEl.textContent = forkId
      ? `Trace ${shortId(forkId)} forked at step #${Number.isFinite(forkStep) ? forkStep : 0}.`
      : "No fork branch detected.";
  }

  const overallRiskScore = Number(
    trace.metadata?.overallRiskScore ?? Math.max(0, ...trace.steps.map((step) => Number(step.riskScore ?? 0)))
  );
  const flagsCount = trace.steps.reduce((sum, step) => sum + (Array.isArray(step.riskFlags) ? step.riskFlags.length : 0), 0);
  if (liveRiskBadgeEl) {
    liveRiskBadgeEl.className = `risk-badge ${riskClass(overallRiskScore)}`;
    liveRiskBadgeEl.textContent = `${overallRiskScore} (${riskLevel(overallRiskScore)})`;
  }
  if (liveRiskTextEl) {
    liveRiskTextEl.textContent = `${flagsCount} flags across ${trace.steps.length} steps.`;
  }

  const stats = state.communityStats ?? {};
  const metrics = state.ycMetrics ?? {};
  const sharedTraces = Number(stats.sharedTraces ?? 0);
  const uniqueSignatures = Number(stats.uniqueSignatures ?? 0);
  const openclawTraces = Number(metrics.openclawTraces ?? 0);

  if (liveGrowthBadgeEl) {
    liveGrowthBadgeEl.textContent = `${formatNumber(sharedTraces)} shared`;
  }
  if (liveGrowthTextEl) {
    liveGrowthTextEl.textContent =
      sharedTraces > 0
        ? `${formatNumber(uniqueSignatures)} signatures • ${formatNumber(openclawTraces)} OpenClaw traces.`
        : "No shared traces yet.";
  }
}

function topologyContactForStep(step) {
  const type = String(step?.type ?? "").toLowerCase();
  const extractFirstUrl = (value) => {
    const match = String(value ?? "").match(/https?:\/\/[^\s)]+/i);
    return match ? match[0] : "";
  };

  if (step?.externalUrl) {
    const host = parseUrlHost(step.externalUrl);
    if (host) {
      return {
        target: host,
        surface: "external",
      };
    }
  }
  if (type === "network") {
    const fallbackUrl = extractFirstUrl(
      `${step?.output ?? ""}\n${step?.prompt ?? ""}\n${step?.command ?? ""}`
    );
    const host = parseUrlHost(fallbackUrl);
    if (host) {
      return {
        target: host,
        surface: "external",
      };
    }
    return { target: "", surface: "external" };
  }
  if (type === "email") {
    return {
      target: "email-provider",
      surface: "external",
    };
  }

  return { target: "", surface: "internal" };
}

function topologyTargetForStep(step) {
  return topologyContactForStep(step).target;
}

function humanizeTargetToken(value) {
  const normalized = String(value ?? "")
    .replace(/^tool:/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .split(" ")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function topologyDisplayTarget(target) {
  const rawTarget = String(target ?? "").trim();
  const lower = rawTarget.toLowerCase();

  if (lower === "email-provider") {
    return { title: "Email Service", detail: "external service" };
  }
  if (lower === "network-endpoint") {
    return { title: "Network Endpoint", detail: "external service" };
  }
  if (lower === "external-endpoint") {
    return { title: "External Endpoint", detail: "network surface" };
  }
  if (lower === "external-network") {
    return { title: "External Network", detail: "network surface" };
  }
  if (rawTarget.includes(".")) {
    return {
      title: trim(rawTarget, 24),
      detail: "external host",
    };
  }

  return {
    title: trim(humanizeTargetToken(rawTarget), 24),
    detail: "network surface",
  };
}

function buildTopologySurfaceState(trace, limit = 10) {
  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    return [];
  }

  const surfaces = new Map();

  for (const step of trace.steps) {
    const contact = topologyContactForStep(step);
    const rawTarget = String(contact.target ?? "").trim();
    if (!rawTarget) {
      continue;
    }

    const key = rawTarget.toLowerCase();
    const model = topologyDisplayTarget(rawTarget);
    const seenAt = step.timestamp ?? trace.updatedAt ?? new Date().toISOString();
    const existing = surfaces.get(key) ?? {
      target: rawTarget,
      title: model.title,
      detail: model.detail,
      surface: contact.surface,
      status: "observed",
      lastSeenAt: seenAt,
      blockedAt: "",
      touchCount: 0,
    };

    existing.target = rawTarget;
    existing.title = model.title;
    existing.detail = model.detail;
    existing.surface = contact.surface;
    existing.lastSeenAt = seenAt;
    existing.touchCount = Number(existing.touchCount ?? 0) + 1;

    if (step.guardStatus === "block") {
      existing.status = "blocked";
      existing.blockedAt = seenAt;
    } else if (step.guardStatus === "allow" && existing.status !== "blocked") {
      existing.status = "allowed";
    }

    surfaces.set(key, existing);
  }

  const approvals = storedTopologyAllows(trace.id);
  for (const [targetKey, approvedAt] of approvals.entries()) {
    const existing = surfaces.get(targetKey);
    if (!existing) {
      continue;
    }
    existing.status = "allowed";
    existing.lastSeenAt = String(approvedAt ?? existing.lastSeenAt ?? new Date().toISOString());
    existing.blockedAt = "";
    surfaces.set(targetKey, existing);
  }

  if (surfaces.size === 0) {
    return [];
  }

  const statusRank = {
    blocked: 0,
    allowed: 1,
    observed: 2,
  };

  return Array.from(surfaces.values())
    .sort((a, b) => {
      const rankDelta = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
      if (rankDelta !== 0) {
        return rankDelta;
      }

      const aTime = new Date(String(a.lastSeenAt ?? "")).valueOf();
      const bTime = new Date(String(b.lastSeenAt ?? "")).valueOf();
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      return safeBTime - safeATime;
    })
    .slice(0, Math.max(1, limit));
}

function isFreshBlock(blockedAt) {
  const timestamp = new Date(String(blockedAt ?? "")).valueOf();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp < 2300;
}

/* ── Topology graph data builder ── */

function buildTopologyGraphData(trace, forkContext) {
  const nodes = [];
  const edges = [];

  const xSpacing = 280;
  const ySpacing = 80;

  nodes.push({ data: { id: "__claudebot__", label: "ClaudeBot\nagent runtime", nodeType: "fixed", target: "" }, position: { x: 0, y: 0 }, classes: "fixed" });
  nodes.push({ data: { id: "__maple__", label: "Maple\nMCP server + firewall", nodeType: "fixed", target: "" }, position: { x: xSpacing, y: 0 }, classes: "fixed" });
  edges.push({ data: { id: "core_cb_maple", source: "__claudebot__", target: "__maple__", linkType: "core" }, classes: "core-edge" });

  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    return { nodes, edges };
  }

  const surfaces = buildTopologySurfaceState(trace, 10);
  const usedIds = new Set(["__claudebot__", "__maple__"]);
  const totalSurfaces = surfaces.length;
  const surfaceStartY = -((totalSurfaces - 1) * ySpacing) / 2;

  surfaces.forEach((entry, index) => {
    let rawId = "surface_" + String(entry.target ?? "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (usedIds.has(rawId)) rawId += "_" + index;
    usedIds.add(rawId);

    const sublabel = entry.status === "blocked" ? "policy: blocked" : entry.status === "allowed" ? "policy: allowed" : "policy: pending";
    const classes = ["surface", entry.status];
    const surfaceY = surfaceStartY + index * ySpacing;

    nodes.push({ data: { id: rawId, label: `${entry.title}\n${sublabel}`, nodeType: "surface", status: entry.status, target: entry.target }, position: { x: xSpacing * 2, y: surfaceY }, classes: classes.join(" ") });
    edges.push({ data: { id: `surface_edge_${rawId}`, source: "__maple__", target: rawId, linkType: "surface" }, classes: `surface-edge ${entry.status}` });
  });

  return { nodes, edges };
}

function initTopologyGraph() {
  if (topologyGraph) return;
  if (!topologyMapEl || topologyMapEl.clientWidth === 0 || topologyMapEl.clientHeight === 0) return;
  if (typeof cytoscape === "undefined") {
    topologyMapEl.innerHTML = '<div class="action-tree-empty"><p>Graph library failed to load.</p></div>';
    return;
  }

  topologyMapEl.innerHTML = "";

  try {
    topologyGraph = cytoscape({
      container: topologyMapEl,
      elements: [],
      style: TOPOLOGY_STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    topologyGraph.on('tap', 'node.surface', (evt) => handleTopologyNodeClick(evt.target.data(), evt));
    topologyGraph.on('mouseover', 'node.surface', () => { topologyMapEl.style.cursor = 'pointer'; });
    topologyGraph.on('mouseout', 'node', () => { topologyMapEl.style.cursor = 'default'; });
    setupGraphResizeObserver(topologyMapEl, topologyGraph);
    startEdgeFlow();
  } catch (err) {
    console.error("Failed to initialize topology graph:", err);
    topologyGraph = null;
    topologyMapEl.innerHTML = '<div class="action-tree-empty"><p>Graph failed to initialize.</p></div>';
  }
}

function handleTopologyNodeClick(nodeData, evt) {
  if (!nodeData) return;
  if (nodeData.nodeType !== "surface") return;

  const target = String(nodeData.target ?? "").trim();
  if (!target) return;

  const containerRect = topologyMapEl.getBoundingClientRect();
  const rendPos = evt?.renderedPosition || evt?.position || { x: 0, y: 0 };
  const screenX = containerRect.left + rendPos.x;
  const screenY = containerRect.top + rendPos.y;
  openTopologyEndpointPopup({ target, status: nodeData.status, screenX, screenY });
}

function renderTopologyMap(trace, forkContext = null) {
  if (!topologyMapEl) {
    return;
  }

  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    if (topologyGraph) {
      topologyGraph.elements().remove();
    } else {
      topologyMapEl.innerHTML = '<div class="empty-row">' + LOADING_KIRBY_SVG + '<p>No topology data yet.</p></div>';
    }
    closeTopologyEndpointPopup();
    return;
  }

  if (!topologyGraph) {
    initTopologyGraph();
    if (!topologyGraph) {
      topologyMapEl._pendingGraphData = { trace, forkContext };
      return;
    }
  }

  const data = buildTopologyGraphData(trace, forkContext);
  patchCyGraph(topologyGraph, data.nodes, data.edges, 40);
  refreshTopologyEndpointPopupAnchor();
}

function renderTopologyTouchLog(trace) {
  void trace;
}

function renderTopologyView(trace, forkContext = null) {
  renderLiveActionStrip(trace, forkContext);
  renderTopologyMap(trace, forkContext);
}

function renderGuardLog(trace) {
  const actions = collectGuardActions(trace);

  if (actions.length === 0) {
    guardLogEl.innerHTML = '<div class="empty-row">' + LOADING_KIRBY_SVG + '<p>No guard actions recorded yet.</p></div>';
  } else {
    guardLogEl.innerHTML = actions
      .map(
        (action) => `<article class="guard-item ${guardClass(action.action)}">
          <div class="guard-row">
            <span class="guard-pill ${guardClass(action.action)}">${escapeHtml(action.action)}</span>
            <span class="guard-step">step #${escapeHtml(action.stepIndex)}</span>
            <span class="guard-time">${escapeHtml(formatTimestamp(action.updatedAt))}</span>
          </div>
          <div>${escapeHtml(action.reason)}</div>
        </article>`
      )
      .join("");
  }

  if (trace.status === "quarantined") {
    const blockedAction = actions.find((action) => action.action === "block");
    const quarantineAt = blockedAction?.updatedAt ?? trace.updatedAt;
    const quarantineStep = blockedAction ? ` at step #${blockedAction.stepIndex}` : "";
    quarantineBannerEl.textContent = `Trace quarantined ${formatTimestamp(quarantineAt)}${quarantineStep}.`;
    quarantineBannerEl.classList.remove("hidden");
  } else {
    quarantineBannerEl.classList.add("hidden");
    quarantineBannerEl.textContent = "";
  }
}

function normalizeComparable(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toolOutput(step) {
  return step?.toolCall?.output;
}

function renderForkEmpty(message) {
  forkMetaEl.textContent = message;
  forkOriginalIdEl.textContent = "-";
  forkForkedIdEl.textContent = "-";
  forkStepIndexEl.textContent = "-";
  forkDiffBodyEl.innerHTML = '<tr><td colspan="3" class="empty-row">No fork diff available yet.</td></tr>';
}

async function resolveForkContext(primaryTrace) {
  let forkTrace = primaryTrace;

  if (!forkTrace.parentTraceId) {
    const forkSummary = state.traces.find((trace) => Boolean(trace.parentTraceId));
    if (!forkSummary) {
      return null;
    }

    const forkId = forkSummary.traceId ?? forkSummary.id;
    if (!forkId) {
      return null;
    }

    forkTrace = await fetchTraceById(forkId);
  }

  if (!forkTrace.parentTraceId) {
    return null;
  }

  if (
    forkCache.forkId === forkTrace.id &&
    forkCache.parentId === forkTrace.parentTraceId &&
    forkCache.forkTrace &&
    forkCache.parentTrace
  ) {
    return {
      forkTrace: forkCache.forkTrace,
      parentTrace: forkCache.parentTrace,
    };
  }

  const parentTrace = await fetchTraceById(forkTrace.parentTraceId);
  forkCache = {
    forkId: forkTrace.id,
    parentId: forkTrace.parentTraceId,
    forkTrace,
    parentTrace,
  };

  return { forkTrace, parentTrace };
}

async function renderForkDiff(primaryTrace, preloadedContext = null) {
  const context = preloadedContext ?? (await resolveForkContext(primaryTrace));
  if (!context) {
    renderForkEmpty("No forked trace detected yet.");
    return;
  }

  const { forkTrace, parentTrace } = context;
  const stepIndex = Number(forkTrace.forkedFromStep ?? 0);
  const originalStep = parentTrace.steps[stepIndex];
  const forkedStep = forkTrace.steps[stepIndex];

  if (!originalStep || !forkedStep) {
    renderForkEmpty("Fork context found, but the fork step is not available.");
    return;
  }

  forkMetaEl.textContent = `Comparing forked trace ${forkTrace.id} against parent ${parentTrace.id} at step ${stepIndex}.`;
  forkOriginalIdEl.textContent = parentTrace.id;
  forkForkedIdEl.textContent = forkTrace.id;
  forkStepIndexEl.textContent = String(stepIndex);

  const fields = [
    { label: "prompt", before: originalStep.prompt, after: forkedStep.prompt },
    { label: "command", before: originalStep.command, after: forkedStep.command },
    { label: "output", before: originalStep.output, after: forkedStep.output },
    { label: "tool output", before: toolOutput(originalStep), after: toolOutput(forkedStep) },
  ];

  forkDiffBodyEl.innerHTML = fields
    .map((field) => {
      const before = normalizeComparable(field.before);
      const after = normalizeComparable(field.after);
      const changed = before !== after;

      return `<tr>
        <td>${escapeHtml(field.label)}</td>
        <td class="${changed ? "changed" : ""}">${escapeHtml(trim(before || "-", 180))}</td>
        <td class="${changed ? "changed" : ""}">${escapeHtml(trim(after || "-", 180))}</td>
      </tr>`;
    })
    .join("");
}

function renderEvidence(trace) {
  evidenceSummaryEl.textContent = `Trace ${trace.id} from /api/traces/${trace.id}`;
  evidenceJsonEl.textContent = JSON.stringify(trace, null, 2);
}

function renderExplorerMeta(trace) {
  const overallRiskScore = Number(
    trace.metadata?.overallRiskScore ??
      Math.max(0, ...trace.steps.map((step) => Number(step.riskScore ?? 0)))
  );
  selectedTraceInfoEl.textContent = [
    `${trace.id} • session ${trace.sessionId}`,
    `source=${trace.source}`,
    `status=${trace.status}`,
    `steps=${trace.steps.length}`,
    `risk=${overallRiskScore} (${riskLevel(overallRiskScore)})`,
  ].join(" • ");
}

function renderExplorerSteps(trace) {
  if (!trace.steps.length) {
    explorerStepListEl.innerHTML = '<p class="empty-row">No steps available.</p>';
    return;
  }

  explorerStepListEl.innerHTML = trace.steps
    .map((step) => {
      const active = state.selectedStepIndex === step.index ? " is-active" : "";
      return `<button class="step-item${active}" type="button" data-step-index="${escapeHtml(step.index)}">
        <div class="step-item-head">
          <span>#${escapeHtml(step.index)} ${escapeHtml(step.type)} / ${escapeHtml(step.actor)}</span>
          <span class="risk-badge ${riskClass(step.riskScore)}">${escapeHtml(step.riskScore)}</span>
        </div>
        <div class="step-item-sub">${escapeHtml(trim(stepCommandOrUrl(step), 110))}</div>
      </button>`;
    })
    .join("");
}

function renderStepInspector(trace, stepIndex) {
  const step = trace.steps.find((candidate) => candidate.index === stepIndex);
  if (!step) {
    stepInspectorTitleEl.textContent = "Step Inspector";
    stepInspectorSummaryEl.textContent = "No step selected";
    stepInspectorJsonEl.textContent = "{}";
    return;
  }

  stepInspectorTitleEl.textContent = `Step #${step.index} ${step.type}/${step.actor}`;
  stepInspectorSummaryEl.textContent = `risk ${step.riskScore} • guard ${step.guardStatus}`;
  stepInspectorJsonEl.textContent = JSON.stringify(step, null, 2);
}

function traceSummaryPassesFilters(summary) {
  const searchTerm = traceSearchEl.value.trim().toLowerCase();
  const riskFilter = traceRiskEl.value;
  const sourceFilter = traceSourceEl.value;

  const searchable = [
    String(summary.traceId ?? summary.id ?? ""),
    String(summary.sessionId ?? ""),
    String(summary.source ?? ""),
    String(summary.status ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (searchTerm && !searchable.includes(searchTerm)) {
    return false;
  }

  if (sourceFilter !== "all" && String(summary.source) !== sourceFilter) {
    return false;
  }

  if (riskFilter !== "all") {
    const summaryRiskLevel = riskLevel(Number(summary.overallRiskScore ?? 0));
    if (summaryRiskLevel !== riskFilter) {
      return false;
    }
  }

  return true;
}

function renderTraceList() {
  const allTraces = state.traces;
  const filtered = allTraces.filter((summary) => traceSummaryPassesFilters(summary));

  traceCountEl.textContent = `${formatNumber(filtered.length)} traces`;

  if (filtered.length === 0) {
    traceListEl.innerHTML = '<p class="empty-row">No traces match your filters.</p>';
    return;
  }

  traceListEl.innerHTML = filtered
    .map((summary) => {
      const traceId = String(summary.traceId ?? summary.id ?? "");
      const selected = traceId === state.selectedTraceId ? " is-active" : "";
      const score = Number(summary.overallRiskScore ?? 0);
      const source = String(summary.source ?? "unknown");
      const status = String(summary.status ?? "unknown");

      return `<button class="trace-item${selected}" type="button" data-trace-id="${escapeHtml(traceId)}">
        <div class="trace-item-head">
          <span class="trace-item-title">${escapeHtml(traceId)}</span>
          <span class="risk-badge ${riskClass(score)}">${escapeHtml(score)}</span>
        </div>
        <div class="trace-item-meta">
          <span>${escapeHtml(source)}</span>
          <span>${escapeHtml(status)}</span>
          <span>${escapeHtml(formatTimestamp(String(summary.updatedAt ?? "")))}</span>
        </div>
      </button>`;
    })
    .join("");
}

function renderCommunityTraces(traces) {
  if (!Array.isArray(traces) || traces.length === 0) {
    communityTableBodyEl.innerHTML = '<tr><td colspan="6" class="empty-row">No shared traces yet.</td></tr>';
    communityCountEl.textContent = "0 shared traces";
    return;
  }

  communityCountEl.textContent = `${formatNumber(traces.length)} shared traces in community stream`;

  communityTableBodyEl.innerHTML = traces
    .map((trace) => {
      const scoreClass = riskClass(Number(trace.riskScore ?? 0));
      const signature = String(trace.behaviorSignature ?? "-");
      const tags = Array.isArray(trace.tags) ? trace.tags.join(", ") : "-";

      return `<tr>
        <td>${escapeHtml(String(trace.id ?? "-"))}</td>
        <td>${escapeHtml(trim(String(trace.taskLabel ?? "-"), 64))}</td>
        <td><span class="risk-badge ${scoreClass}">${escapeHtml(String(trace.riskSeverity ?? "low"))}</span></td>
        <td>${escapeHtml(trim(signature, 36))}</td>
        <td>${escapeHtml(trim(tags, 50))}</td>
        <td>${escapeHtml(formatTimestamp(String(trace.sharedAt ?? "")))}</td>
      </tr>`;
    })
    .join("");
}

async function loadCommunityStats() {
  const payload = await fetchJson("/api/community/stats");
  const stats = payload.stats ?? {};
  const metrics = payload.ycMetrics ?? {};
  state.communityStats = stats;
  state.ycMetrics = metrics;

  setMetric(metricEls.sharedTraces, stats.sharedTraces);
  setMetric(metricEls.uniqueSignatures, stats.uniqueSignatures);
  setMetric(metricEls.openclawTraces, metrics.openclawTraces);
  setMetric(metricEls.highRiskDetections, metrics.highRiskDetections);

  if (state.currentTrace) {
    renderLiveActionStrip(state.currentTrace, state.currentForkContext);
  }
}

async function loadCommunityTraces() {
  const payload = await fetchJson("/api/community/traces");
  const traces = Array.isArray(payload?.traces) ? payload.traces : [];
  state.communityTraces = traces;
  renderCommunityTraces(traces);
}

function summarizeBrief(payload) {
  const brief = payload?.brief ?? {};
  if (brief.oneLiner) {
    return brief.oneLiner;
  }
  if (brief.moat?.thesis) {
    return brief.moat.thesis;
  }
  if (brief.traction?.thesis) {
    return brief.traction.thesis;
  }
  if (brief.revenue?.thesis) {
    return brief.revenue.thesis;
  }
  return "Brief loaded.";
}

async function loadYcBrief() {
  const payload = await fetchJson(`/api/yc/brief?focus=${encodeURIComponent(state.activeFocus)}`);
  briefSummaryEl.textContent = summarizeBrief(payload);
  briefJsonEl.textContent = JSON.stringify(payload, null, 2);
}

function clearLivePanels(message) {
  sourceBadgeEl.className = "source-badge source-unknown";
  sourceBadgeEl.textContent = "source=unknown";
  sourceHintEl.textContent = message;
  sourceHintEl.classList.remove("mock");
  sessionTraceIdEl.textContent = "-";
  sessionSessionIdEl.textContent = "-";
  sessionLastEventEl.textContent = "-";
  sessionRiskBadgeEl.className = "risk-badge risk-low";
  sessionRiskBadgeEl.textContent = "0 (low)";

  if (actionTreeGraph) {
    actionTreeGraph.elements().remove();
  } else {
    actionTreeCanvasEl.innerHTML = '<div class="action-tree-empty">' + LOADING_KIRBY_SVG + '<p>No trace loaded.</p></div>';
  }

  timelineBodyEl.innerHTML = '<tr><td colspan="6" class="empty-row">No trace loaded.</td></tr>';
  renderTopologyView(null, null);

  guardLogEl.innerHTML = '<div class="empty-row">' + LOADING_KIRBY_SVG + '<p>No guard actions recorded yet.</p></div>';
  quarantineBannerEl.classList.add("hidden");
  quarantineBannerEl.textContent = "";

  renderForkEmpty("No forked trace detected yet.");

  selectedTraceInfoEl.textContent = "Select a trace to inspect event-by-event details.";
  explorerStepListEl.innerHTML = '<p class="empty-row">No steps available.</p>';
  stepInspectorTitleEl.textContent = "Step Inspector";
  stepInspectorSummaryEl.textContent = "No step selected";
  stepInspectorJsonEl.textContent = "{}";

  evidenceSummaryEl.textContent = "No trace payload loaded.";
  evidenceJsonEl.textContent = "{}";
  state.currentTrace = null;
  state.currentForkContext = null;
  state.firewallContext = null;
  setFirewallChatContext(null);
  closeNodeModal();
  closeTopologyEndpointPopup();
}

function parseErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "Unknown error");
}

function handleRefreshError(context, error, silent) {
  const message = parseErrorMessage(error);
  const isUnauthorized = message.includes("HTTP 401");

  if (!silent) {
    setStatus(`Failed to ${context}: ${message}`, "error");
  }

  if (isUnauthorized) {
    setPollState("error", "401 Unauthorized. Sign in again.");
    stopPolling();
    return;
  }

  if (!silent) {
    setPollState("error", "Polling encountered an error.");
  }
}

function ensureSelectedTraceId(traces) {
  if (!Array.isArray(traces) || traces.length === 0) {
    state.selectedTraceId = "";
    return;
  }

  const exists = traces.some((summary) => String(summary.traceId ?? summary.id ?? "") === state.selectedTraceId);
  if (!exists) {
    state.selectedTraceId = String(traces[0].traceId ?? traces[0].id ?? "");
  }
}

function ensureSelectedStep(trace) {
  if (!trace || !Array.isArray(trace.steps) || trace.steps.length === 0) {
    state.selectedStepIndex = null;
    return;
  }

  const exists = trace.steps.some((step) => step.index === state.selectedStepIndex);
  if (!exists) {
    state.selectedStepIndex = trace.steps[trace.steps.length - 1].index;
  }
}

async function syncSelectedOpenClawTrace(summary, { silent = false } = {}) {
  if (!summary) {
    return;
  }
  const source = String(summary.source ?? "").toLowerCase();
  if (source !== "openclaw") {
    return;
  }
  const traceId = String(summary.traceId ?? summary.id ?? "").trim();
  if (!traceId) {
    return;
  }

  try {
    await postJson("/api/demo/sync", { traceId });
  } catch (error) {
    if (!silent) {
      const message = parseErrorMessage(error);
      setStatus(`OpenClaw live sync warning: ${message}`, "error");
    }
  }
}

async function refreshTracePanels({ silent = false } = {}) {
  if (traceRefreshInFlight) {
    return;
  }
  traceRefreshInFlight = true;

  try {
    const traceListPayload = await fetchJson("/api/traces");
    const traces = Array.isArray(traceListPayload?.traces) ? traceListPayload.traces : [];
    state.traces = traces;

    ensureSelectedTraceId(traces);
    renderTraceList();

    if (traces.length === 0 || !state.selectedTraceId) {
      clearLivePanels("No traces yet. Run observe_session to start monitoring.");
      if (!silent) {
        setStatus("Connected. No traces yet.", "ok");
      }
      return;
    }

    const selectedSummary =
      traces.find((summary) => String(summary.traceId ?? summary.id ?? "") === state.selectedTraceId) ??
      traces[0];
    await syncSelectedOpenClawTrace(selectedSummary, { silent: true });

    const trace = await fetchTraceById(state.selectedTraceId);
    state.currentTrace = trace;

    ensureSelectedStep(trace);

    const forkContext = await resolveForkContext(trace);
    state.currentForkContext = forkContext;

    renderSessionStrip(trace);
    renderTopologyView(trace, forkContext);
    renderActionTree(trace, forkContext);
    renderTimeline(trace);
    renderGuardLog(trace);
    await renderForkDiff(trace, forkContext);
    renderEvidence(trace);

    renderExplorerMeta(trace);
    renderExplorerSteps(trace);
    renderStepInspector(trace, state.selectedStepIndex);
    await loadFirewallState({ silent: true }).catch(() => {});

    if (!silent) {
      setStatus("Connected.", "ok");
    }
  } finally {
    traceRefreshInFlight = false;
  }
}

async function refreshMetrics({ silent = false } = {}) {
  if (metricsRefreshInFlight) {
    return;
  }
  metricsRefreshInFlight = true;

  try {
    await Promise.all([loadCommunityStats(), loadCommunityTraces(), loadYcBrief()]);
  } catch (error) {
    handleRefreshError("refresh metrics", error, silent);
    throw error;
  } finally {
    metricsRefreshInFlight = false;
  }
}

function stopPolling() {
  if (tracePollTimer) {
    window.clearInterval(tracePollTimer);
    tracePollTimer = undefined;
  }
  if (metricsPollTimer) {
    window.clearInterval(metricsPollTimer);
    metricsPollTimer = undefined;
  }
}

function startPolling() {
  stopPolling();
  setPollState("live", "Polling traces every 1.5s.");

  tracePollTimer = window.setInterval(() => {
    refreshTracePanels({ silent: true }).catch((error) => handleRefreshError("poll trace", error, true));
  }, TRACE_POLL_MS);

  metricsPollTimer = window.setInterval(() => {
    refreshMetrics({ silent: true }).catch(() => {});
  }, METRICS_POLL_MS);
}

async function loadBridgeSessions() {
  const datalist = document.getElementById("demoSessionList");
  if (!datalist) return;
  try {
    const data = await fetchJson("/api/demo/sessions");
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    datalist.innerHTML = "";
    for (const s of sessions) {
      const opt = document.createElement("option");
      opt.value = String(s);
      datalist.appendChild(opt);
    }
  } catch {
    /* ignore — autocomplete just won't populate */
  }
}

/* ── Admin: Marketplace handlers ── */

async function refreshMarketplaceProviders() {
  // Marketplace execution is disabled in hackathon mode; tab is repurposed to show fixed local tools.
  state.marketplaceProviders = {
    hackathon: {
      enabled: true,
      source: "local_downstream_apps",
    },
  };
}

function filterMarketplaceTools(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  const tools = Array.isArray(state.marketplaceTools) ? state.marketplaceTools : [];
  if (!normalized) {
    return tools;
  }
  return tools.filter((tool) => {
    const haystack = [
      tool?.name,
      tool?.description,
      tool?.appId,
    ]
      .map((value) => String(value ?? "").toLowerCase())
      .join(" ");
    return haystack.includes(normalized);
  });
}

async function searchMarketplace() {
  const query = marketplaceSearchInput?.value?.trim() ?? "";
  if (!state.marketplaceTools.length) {
    await refreshMarketplaceTools();
  }
  state.marketplaceSearchResults = filterMarketplaceTools(query);
  renderMarketplaceResults();
}

function renderMarketplaceResults() {
  if (!marketplaceResultsBody) return;
  const results = Array.isArray(state.marketplaceSearchResults) ? state.marketplaceSearchResults : [];
  if (!results.length) {
    marketplaceResultsBody.innerHTML = `<tr><td colspan="4" class="empty-row">No installed tools found.</td></tr>`;
    return;
  }
  marketplaceResultsBody.innerHTML = results.map((r) => `
    <tr>
      <td class="mono">${escapeHtml(r.name ?? "-")}</td>
      <td class="mono">${escapeHtml(shortId(r.appId ?? "-", 16))}</td>
      <td>${escapeHtml(trim(r.description ?? "-", 80))}</td>
      <td><button class="demo-btn" data-dispatch-tool="${escapeHtml(r.name ?? "")}" data-dispatch-app="${escapeHtml(r.appId ?? "")}">Dispatch</button></td>
    </tr>
  `).join("");

  marketplaceResultsBody.querySelectorAll("[data-dispatch-tool]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-dispatch-tool");
      const appId = btn.getAttribute("data-dispatch-app") ?? "";
      if (dispatchToolNameInput instanceof HTMLInputElement) {
        dispatchToolNameInput.value = name ?? "";
        dispatchToolNameInput.dataset.appId = appId;
      }
    });
  });
}

async function connectMarketplaceApp(serverId, provider) {
  setStatus("Marketplace connect is disabled in canonical hackathon mode.", "error");
}

async function refreshMarketplaceConnected() {
  try {
    const data = await httpModule.fetchJson("/api/downstream/apps");
    const apps = Array.isArray(data?.apps) ? data.apps : [];
    state.marketplaceConnectedApps = apps.filter((app) => app?.enabled !== false);
    renderMarketplaceConnected();
  } catch {
    state.marketplaceConnectedApps = [];
    renderMarketplaceConnected();
  }
}

function renderMarketplaceConnected() {
  if (!marketplaceConnectedBody) return;
  const apps = state.marketplaceConnectedApps;
  if (!apps.length) {
    marketplaceConnectedBody.innerHTML = `<tr><td colspan="4" class="empty-row">No connected apps.</td></tr>`;
    return;
  }
  marketplaceConnectedBody.innerHTML = apps.map((app) => `
    <tr>
      <td class="mono">${escapeHtml(shortId(app.id ?? "-", 16))}</td>
      <td>${escapeHtml(app.name ?? "-")}</td>
      <td class="mono">${escapeHtml(trim(app.mcpUrl ?? "-", 50))}</td>
      <td>${escapeHtml(app.id === "toolhub" ? "route-locked" : "available")}</td>
    </tr>
  `).join("");
}

async function disconnectMarketplaceApp(appId) {
  setStatus("Marketplace disconnect is disabled in canonical hackathon mode.", "error");
}

async function refreshMarketplaceTools() {
  try {
    let apps = Array.isArray(state.marketplaceConnectedApps) ? state.marketplaceConnectedApps : [];
    if (!apps.length) {
      const connected = await httpModule.fetchJson("/api/downstream/apps");
      apps = Array.isArray(connected.apps) ? connected.apps : [];
      state.marketplaceConnectedApps = apps;
      renderMarketplaceConnected();
    }

    const collected = [];
    for (const app of apps) {
      const appId = app?.appId ?? app?.id;
      if (!appId) {
        continue;
      }
      try {
        const data = await httpModule.fetchJson(
          `/api/downstream/tools?appId=${encodeURIComponent(String(appId))}`
        );
        const tools = Array.isArray(data?.tools) ? data.tools : [];
        for (const tool of tools) {
          collected.push({
            ...tool,
            appId: tool?.appId ?? appId,
          });
        }
      } catch {
        // Keep rendering other apps if one tools/list call fails.
      }
    }

    state.marketplaceTools = collected;
    const query = marketplaceSearchInput?.value?.trim() ?? "";
    state.marketplaceSearchResults = filterMarketplaceTools(query);
    renderMarketplaceResults();
    renderMarketplaceTools();
  } catch {
    state.marketplaceTools = [];
    state.marketplaceSearchResults = [];
    renderMarketplaceResults();
    renderMarketplaceTools();
  }
}

function renderMarketplaceTools() {
  if (!marketplaceToolsBody) return;
  const tools = state.marketplaceTools;
  if (!tools.length) {
    marketplaceToolsBody.innerHTML = `<tr><td colspan="4" class="empty-row">No tools loaded.</td></tr>`;
    return;
  }
  marketplaceToolsBody.innerHTML = tools.map((tool) => `
    <tr>
      <td class="mono">${escapeHtml(tool.name ?? "-")}</td>
      <td class="mono">${escapeHtml(shortId(tool.appId ?? "-", 16))}</td>
      <td>${escapeHtml(trim(tool.description ?? "-", 60))}</td>
      <td><button class="demo-btn" data-dispatch-tool="${escapeHtml(tool.name ?? "")}" data-dispatch-app="${escapeHtml(tool.appId ?? "")}">Dispatch</button></td>
    </tr>
  `).join("");

  marketplaceToolsBody.querySelectorAll("[data-dispatch-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-dispatch-tool");
      const appId = btn.getAttribute("data-dispatch-app") ?? "";
      if (dispatchToolNameInput instanceof HTMLInputElement) {
        dispatchToolNameInput.value = name ?? "";
        dispatchToolNameInput.dataset.appId = appId;
      }
    });
  });
}

async function dispatchTool() {
  const toolName = dispatchToolNameInput?.value?.trim() ?? "";
  const argsRaw = dispatchToolArgsInput?.value?.trim() ?? "{}";
  const selectedAppId =
    dispatchToolNameInput instanceof HTMLInputElement
      ? dispatchToolNameInput.dataset.appId?.trim() ?? ""
      : "";
  const runtimeStatus = state.runtimeStatus?.status ?? state.runtimeStatus ?? {};
  const routeLockEnabled = runtimeStatus?.routeLock === true;
  if (!toolName) {
    if (dispatchResultEl) dispatchResultEl.textContent = JSON.stringify({ error: "Tool name required." }, null, 2);
    return;
  }
  let args = {};
  try {
    args = JSON.parse(argsRaw);
  } catch {
    if (dispatchResultEl) dispatchResultEl.textContent = JSON.stringify({ error: "Invalid JSON arguments." }, null, 2);
    return;
  }
  try {
    const body = {
      toolName,
      arguments: args,
      ...(selectedAppId && !routeLockEnabled ? { appId: selectedAppId } : {}),
    };
    const result = await httpModule.postJson("/api/downstream/dispatch", body);
    if (dispatchResultEl) dispatchResultEl.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    if (dispatchResultEl) dispatchResultEl.textContent = JSON.stringify({ error: error.message }, null, 2);
  }
}

/* ── Admin: Policy handlers ── */

function buildPolicyStep() {
  return {
    type: policyTypeSelect?.value ?? "tool_call",
    actor: policyActorSelect?.value ?? "agent",
    command: policyCommandInput?.value?.trim() ?? "",
    externalUrl: policyUrlInput?.value?.trim() || undefined,
    prompt: policyPromptInput?.value?.trim() || undefined,
    toolCall: policyToolNameInput?.value?.trim() ? { name: policyToolNameInput.value.trim() } : undefined,
  };
}

async function previewPolicyDecision() {
  const step = buildPolicyStep();
  const body = {
    step,
    traceId: policyTraceIdInput?.value?.trim() || undefined,
    sessionId: policySessionIdInput?.value?.trim() || undefined,
    mode: "preview",
  };
  try {
    const result = await httpModule.postJson("/api/firewall/decision", body);
    if (policyResultEl) policyResultEl.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    if (policyResultEl) policyResultEl.textContent = JSON.stringify({ error: error.message }, null, 2);
  }
}

async function enforcePolicyDecision() {
  const step = buildPolicyStep();
  const body = {
    step,
    traceId: policyTraceIdInput?.value?.trim() || undefined,
    sessionId: policySessionIdInput?.value?.trim() || undefined,
    mode: "enforce",
  };
  try {
    const result = await httpModule.postJson("/api/firewall/decision", body);
    if (policyResultEl) policyResultEl.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    if (policyResultEl) policyResultEl.textContent = JSON.stringify({ error: error.message }, null, 2);
  }
}

/* ── Admin: Settings handlers ── */

async function refreshSettingsPanel() {
  // Auth info
  try {
    const authData = await httpModule.fetchJson("/api/auth/me");
    if (settingsAuthStatusEl) {
      settingsAuthStatusEl.textContent = authData.authenticated ? "Authenticated" : "Not authenticated";
    }
    if (settingsAuthUserEl) {
      settingsAuthUserEl.textContent = authData.user?.username ?? authData.user?.email ?? "-";
    }
  } catch {
    if (settingsAuthStatusEl) settingsAuthStatusEl.textContent = "Unknown";
    if (settingsAuthUserEl) settingsAuthUserEl.textContent = "-";
  }

  // Runtime status
  try {
    const runtime = await httpModule.fetchJson("/api/runtime/status");
    state.runtimeStatus = runtime;
    if (settingsRuntimeStatusEl) {
      settingsRuntimeStatusEl.textContent = JSON.stringify(runtime, null, 2);
    }
  } catch {
    if (settingsRuntimeStatusEl) settingsRuntimeStatusEl.textContent = "{}";
  }
}

function setSettingsActionResult(message, tone = "") {
  if (!settingsActionResultEl) return;
  settingsActionResultEl.textContent = message;
  settingsActionResultEl.classList.remove("ok", "error");
  if (tone) settingsActionResultEl.classList.add(tone);
}

async function clearTraceHistory() {
  if (!confirm("Clear all trace history? This cannot be undone.")) {
    return;
  }
  try {
    const result = await httpModule.postJson("/api/traces/clear");
    setSettingsActionResult(`Cleared ${result.removed ?? 0} traces.`, "ok");
    await refreshTracePanels();
  } catch (error) {
    setSettingsActionResult(`Clear failed: ${error.message}`, "error");
  }
}

async function refreshAdminPanels() {
  await Promise.allSettled([
    refreshMarketplaceProviders(),
    refreshMarketplaceConnected(),
    refreshMarketplaceTools(),
    refreshSettingsPanel(),
  ]);
}

async function connectAndRefresh() {
  updateMcpSnippet();

  setStatus("Connecting to live APIs...", "");
  setPollState("live", "Connecting...");

  try {
    await Promise.all([refreshTracePanels(), refreshMetrics()]);
    state.authenticated = true;
    const key = resolveApiKeyFromSession();
    if (key) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    }
    startPolling();
    loadBridgeSessions();
    refreshAdminPanels();
  } catch (error) {
    const msg = String(error?.message ?? "");
    if (msg.includes("401") || msg.includes("403")) {
      state.authenticated = false;
      stopPolling();
      clearLivePanels("Sign in required. Open /landing to authenticate.");
      renderCommunityTraces([]);
      setPollState("error", "Authentication required.");
      setStatus("Sign in required. Open /landing and sign in.", "error");
    } else {
      handleRefreshError("connect", error, false);
    }
  }
}

function currentTraceId() {
  if (state.currentTrace?.id) {
    return String(state.currentTrace.id);
  }
  if (state.selectedTraceId) {
    return String(state.selectedTraceId);
  }
  if (state.traces[0]?.traceId) {
    return String(state.traces[0].traceId);
  }
  if (state.traces[0]?.id) {
    return String(state.traces[0].id);
  }
  return "";
}

function modalTraceIdOrCurrent() {
  if (nodeModalState.traceId) {
    return String(nodeModalState.traceId);
  }
  return "";
}

function parseCommaTags(value) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function ensureDemoReady() {
  if (!state.authenticated && !resolveApiKeyFromSession()) {
    setStatus("Sign in required. Open /landing and sign in.", "error");
    setDemoResult("Authentication missing. Open /landing and sign in.", "error");
    return false;
  }
  return true;
}

async function runDemoAction(actionLabel, callback) {
  if (!ensureDemoReady()) {
    return;
  }
  if (demoActionInFlight) {
    return;
  }

  demoActionInFlight = true;
  setDemoButtonsDisabled(true);
  setDemoResult(`${actionLabel} in progress...`);

  try {
    await callback();
  } catch (error) {
    const message = parseErrorMessage(error);
    setDemoResult(`${actionLabel} failed: ${message}`, "error");
    handleRefreshError(actionLabel, error, false);
  } finally {
    demoActionInFlight = false;
    setDemoButtonsDisabled(false);
  }
}

async function runDemoStart() {
  const sessionId =
    demoSessionIdInput instanceof HTMLInputElement && demoSessionIdInput.value.trim()
      ? demoSessionIdInput.value.trim()
      : `yc-demo-${Date.now()}`;
  const source =
    demoSourceSelect instanceof HTMLSelectElement && demoSourceSelect.value
      ? demoSourceSelect.value
      : "openclaw";

  const payload = await postJson("/api/demo/start", {
    sessionId,
    source,
    reuseLatest: false,
  });

  if (payload?.traceId) {
    state.selectedTraceId = String(payload.traceId);
  }

  await Promise.all([refreshTracePanels(), refreshMetrics()]);
  setDemoResult(
    `Started trace ${payload.traceId} from source=${payload.source}. Recommended block step #${payload.recommendedBlockStepIndex}.`,
    "ok"
  );
}

async function runDemoAudit() {
  const traceId = currentTraceId();
  if (!traceId) {
    setDemoResult("No trace found. Click Start first.", "error");
    return;
  }

  const payload = await postJson("/api/demo/audit", { traceId });
  await refreshTracePanels({ silent: true });
  setDemoResult(
    `Audit complete for ${payload.traceId}: risk ${payload.overallRiskScore} (${payload.severity}), flags ${payload.flagCount}.`,
    "ok"
  );
}

async function runDemoBlock() {
  const traceId = currentTraceId();
  if (!traceId) {
    setDemoResult("No trace found. Click Start first.", "error");
    return;
  }

  const payload = await postJson("/api/demo/block", { traceId });
  state.selectedTraceId = String(payload.traceId);
  await refreshTracePanels();
  setDemoResult(
    `Blocked step #${payload.stepIndex} on trace ${payload.traceId}. Trace status: ${payload.status}.`,
    "ok"
  );
}

async function runDemoFork() {
  const traceId = currentTraceId();
  if (!traceId) {
    setDemoResult("No trace found. Click Start first.", "error");
    return;
  }

  const payload = await postJson("/api/demo/fork", { traceId });
  state.selectedTraceId = String(payload.forkedTraceId ?? traceId);
  await refreshTracePanels();
  setDemoResult(
    `Forked trace ${payload.traceId} at step #${payload.forkStepIndex}. New fork id ${payload.forkedTraceId}.`,
    "ok"
  );
}

async function applyNodeGuardAction(action = "pending") {
  if (nodeModalBusy) {
    return;
  }
  const traceId = nodeModalState.traceId;
  const rawStepIndex = nodeModalState.stepIndex;
  if (!traceId || rawStepIndex === null || rawStepIndex === undefined) {
    setNodeModalStatus("Select a node first.", "error");
    return;
  }
  const stepIndex = Number(rawStepIndex);
  if (!Number.isFinite(stepIndex)) {
    setNodeModalStatus("Invalid step index.", "error");
    return;
  }

  const guardAction = ["allow", "block", "pending"].includes(action) ? action : "pending";
  const reason =
    nodeGuardReasonEl instanceof HTMLInputElement ? nodeGuardReasonEl.value.trim() : "";

  nodeModalBusy = true;
  setNodeModalButtonsDisabled(true);
  setNodeModalStatus("Applying guard action...");

  try {
    const payload = await postJson("/api/demo/guard", {
      traceId,
      stepIndex,
      action: guardAction,
      reason,
    });
    state.selectedTraceId = String(payload.traceId ?? traceId);
    state.selectedStepIndex = Number(payload.stepIndex ?? stepIndex);
    await refreshTracePanels();
    setNodeModalOutput(payload, "guard_action");
    setNodeModalStatus(
      `Guard action applied: ${payload.guardAction} on step #${payload.stepIndex}.`,
      "ok"
    );
    setDemoResult(
      `Guard updated from node modal: ${payload.guardAction} on step #${payload.stepIndex}.`,
      "ok"
    );
  } catch (error) {
    setNodeModalStatus(`Guard action failed: ${parseErrorMessage(error)}`, "error");
  } finally {
    nodeModalBusy = false;
    setNodeModalButtonsDisabled(false);
  }
}

async function createForkFromNode() {
  if (nodeModalBusy) {
    return;
  }
  const traceId = nodeModalState.traceId;
  const rawStepIndex = nodeModalState.stepIndex;
  if (!traceId || rawStepIndex === null || rawStepIndex === undefined) {
    setNodeModalStatus("Select a node first.", "error");
    return;
  }
  const stepIndex = Number(rawStepIndex);
  if (!Number.isFinite(stepIndex)) {
    setNodeModalStatus("Invalid step index.", "error");
    return;
  }

  const edits = {};
  if (nodeForkCommandEl instanceof HTMLInputElement && nodeForkCommandEl.value.trim()) {
    edits.command = nodeForkCommandEl.value.trim();
  }
  if (nodeForkNoteEl instanceof HTMLInputElement && nodeForkNoteEl.value.trim()) {
    edits.appendSimulationNote = nodeForkNoteEl.value.trim();
  }

  const launchIsolatedSession =
    nodeForkLaunchRuntimeEl instanceof HTMLInputElement ? nodeForkLaunchRuntimeEl.checked : false;
  const forkSessionId =
    nodeForkSessionIdEl instanceof HTMLInputElement && nodeForkSessionIdEl.value.trim()
      ? nodeForkSessionIdEl.value.trim()
      : undefined;

  nodeModalBusy = true;
  setNodeModalButtonsDisabled(true);
  setNodeModalStatus("Creating fork...");

  try {
    const payload = await postJson("/api/demo/fork", {
      traceId,
      forkStepIndex: stepIndex,
      edits,
      launchIsolatedSession,
      forkSessionId,
    });
    const runtimeTraceId = payload?.runtime?.traceId ? String(payload.runtime.traceId) : "";
    state.selectedTraceId = runtimeTraceId || String(payload.forkedTraceId ?? traceId);
    state.selectedStepIndex = Number(payload.forkStepIndex ?? stepIndex);
    await refreshTracePanels();
    const runtimeLabel =
      payload?.runtime?.launched === true
        ? ` Isolated session ${payload.runtime.sessionId} started.`
        : payload?.runtime?.error
          ? ` Runtime launch failed: ${payload.runtime.error}`
          : "";
    setNodeModalOutput(payload, "replay_fork");
    setNodeModalStatus(
      `Fork created from step #${stepIndex}. Trace ${payload.forkedTraceId}.${runtimeLabel}`,
      payload?.runtime?.error ? "error" : "ok"
    );
    setDemoResult(
      `Fork created from node step #${stepIndex}. New trace ${payload.forkedTraceId}.${runtimeLabel}`,
      payload?.runtime?.error ? "error" : "ok"
    );
    if (!payload?.runtime?.error) {
      closeNodeModal();
    } else {
      nodeModalBusy = false;
      setNodeModalButtonsDisabled(false);
    }
  } catch (error) {
    setNodeModalStatus(`Fork failed: ${parseErrorMessage(error)}`, "error");
    nodeModalBusy = false;
    setNodeModalButtonsDisabled(false);
  }
}

async function runNodeModalTask(label, fn) {
  if (nodeModalBusy) {
    return;
  }
  if (!ensureDemoReady()) {
    return;
  }

  nodeModalBusy = true;
  setNodeModalButtonsDisabled(true);
  setNodeModalStatus(`${label} running...`);

  try {
    await fn();
  } catch (error) {
    setNodeModalStatus(`${label} failed: ${parseErrorMessage(error)}`, "error");
  } finally {
    nodeModalBusy = false;
    setNodeModalButtonsDisabled(false);
  }
}

async function runNodeAudit() {
  const traceId = modalTraceIdOrCurrent();
  if (!traceId) {
    setNodeModalStatus("Select an OpenClaw node first.", "error");
    return;
  }

  const payload = await postJson("/api/demo/audit", { traceId });
  await refreshTracePanels({ silent: true });
  setNodeModalOutput(payload, "audit_risk");
  setNodeModalStatus(
    `Audit complete: risk ${payload.overallRiskScore} (${payload.severity}), flags ${payload.flagCount}.`,
    "ok"
  );
}

async function runNodeMl() {
  const traceId = modalTraceIdOrCurrent();
  if (!traceId) {
    setNodeModalStatus("Select an OpenClaw node first.", "error");
    return;
  }

  const payload = await postJson("/api/demo/ml", {
    traceId,
    useCommunityBaseline: true,
    threshold: 0.58,
    topAnomalies: 5,
  });
  await refreshTracePanels({ silent: true });
  setNodeModalOutput(payload, "ml_anomaly_report");
  setNodeModalStatus(
    `ML anomaly report complete: ${payload.anomalyCount} anomalies, severity ${payload.severity}.`,
    "ok"
  );
}

async function runNodeShare() {
  const traceId = modalTraceIdOrCurrent();
  if (!traceId) {
    setNodeModalStatus("Select an OpenClaw node first.", "error");
    return;
  }

  const taskLabel =
    nodeShareTaskEl instanceof HTMLInputElement && nodeShareTaskEl.value.trim()
      ? nodeShareTaskEl.value.trim()
      : "safe agent workflow";
  const objective =
    nodeShareObjectiveEl instanceof HTMLInputElement && nodeShareObjectiveEl.value.trim()
      ? nodeShareObjectiveEl.value.trim()
      : "prevent risky autonomous actions before execution";
  const tags =
    nodeShareTagsEl instanceof HTMLInputElement
      ? parseCommaTags(nodeShareTagsEl.value)
      : ["security", "guardrails", "openclaw"];

  const payload = await postJson("/api/demo/share", {
    traceId,
    taskLabel,
    objective,
    tags,
  });
  await refreshMetrics({ silent: true }).catch(() => {});
  setNodeModalOutput(payload, "share_trace_anon");
  setNodeModalStatus(`Shared trace ${payload.sharedTraceId} with anonymization.`, "ok");
}

async function runNodeSuggest() {
  const traceId = modalTraceIdOrCurrent();
  if (!traceId) {
    setNodeModalStatus("Select an OpenClaw node first.", "error");
    return;
  }

  const query =
    nodeSuggestQueryEl instanceof HTMLInputElement && nodeSuggestQueryEl.value.trim()
      ? nodeSuggestQueryEl.value.trim()
      : "safe inbox triage automation";

  const payload = await postJson("/api/demo/suggest", {
    query,
    limit: 3,
    minConfidence: 0.4,
  });
  await refreshMetrics({ silent: true }).catch(() => {});
  setNodeModalOutput(payload, "suggest_evolved_skills");
  setNodeModalStatus(`Generated ${payload.count} evolved skill suggestions.`, "ok");
}

async function runNodeBrief() {
  const traceId = modalTraceIdOrCurrent();
  if (!traceId) {
    setNodeModalStatus("Select an OpenClaw node first.", "error");
    return;
  }

  const focus =
    nodeBriefFocusEl instanceof HTMLSelectElement && nodeBriefFocusEl.value
      ? nodeBriefFocusEl.value
      : "full";

  const payload = await postJson("/api/demo/brief", { focus });
  await loadYcBrief().catch(() => {});
  setNodeModalOutput(payload, "yc_app_brief");
  setNodeModalStatus(`YC brief generated for focus=${focus}.`, "ok");
}

async function runDemoFull() {
  const sessionId =
    demoSessionIdInput instanceof HTMLInputElement && demoSessionIdInput.value.trim()
      ? demoSessionIdInput.value.trim()
      : `yc-demo-${Date.now()}`;
  const source =
    demoSourceSelect instanceof HTMLSelectElement && demoSourceSelect.value
      ? demoSourceSelect.value
      : "openclaw";

  const payload = await postJson("/api/demo/full", {
    sessionId,
    source,
  });

  state.selectedTraceId = String(payload.forkedTraceId ?? payload.traceId ?? "");
  await Promise.all([refreshTracePanels(), refreshMetrics()]);
  setDemoResult(
    `Full flow done: blocked step #${payload.blockStepIndex}, fork ${payload.forkedTraceId}, shared trace ${payload.sharedTraceId}.`,
    "ok"
  );
}

async function runInjectEvent() {
  if (!ensureDemoReady()) {
    return;
  }

  const actor =
    injectActorSelect instanceof HTMLSelectElement ? injectActorSelect.value : "agent";
  const type =
    injectTypeSelect instanceof HTMLSelectElement ? injectTypeSelect.value : "tool_call";
  const command =
    injectCommandInput instanceof HTMLInputElement ? injectCommandInput.value.trim() : "";
  const output =
    injectOutputInput instanceof HTMLInputElement ? injectOutputInput.value.trim() : "";
  const toolName =
    injectToolNameInput instanceof HTMLInputElement ? injectToolNameInput.value.trim() : "";
  const url =
    injectUrlInput instanceof HTMLInputElement ? injectUrlInput.value.trim() : "";

  if (!command && !toolName) {
    setInjectResult("Enter a command/prompt or tool name.", "error");
    return;
  }

  const traceId = currentTraceId();
  const sessionId =
    demoSessionIdInput instanceof HTMLInputElement && demoSessionIdInput.value.trim()
      ? demoSessionIdInput.value.trim()
      : undefined;

  const event = { actor, type };
  if (command) event.command = command;
  if (command) event.prompt = command;
  if (output) event.output = output;
  if (toolName) event.toolName = toolName;
  if (url) event.url = url;

  if (injectEventBtn instanceof HTMLButtonElement) {
    injectEventBtn.disabled = true;
  }
  setInjectResult("Injecting event...");

  try {
    const payload = await postJson("/api/demo/ingest", {
      traceId: traceId || undefined,
      sessionId: traceId ? undefined : sessionId,
      event,
    });

    state.selectedTraceId = String(payload.traceId ?? "");
    await Promise.all([refreshTracePanels(), refreshMetrics()]);
    setInjectResult(
      `Step #${payload.appendedStep} injected into trace ${payload.traceId} (risk: ${payload.overallRiskScore}).`,
      "ok"
    );
  } catch (error) {
    setInjectResult(`Inject failed: ${parseErrorMessage(error)}`, "error");
  } finally {
    if (injectEventBtn instanceof HTMLButtonElement) {
      injectEventBtn.disabled = false;
    }
  }
}

traceListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-trace-id]");
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const traceId = button.dataset.traceId;
  if (!traceId || traceId === state.selectedTraceId) {
    return;
  }

  state.selectedTraceId = traceId;
  refreshTracePanels().catch((error) => handleRefreshError("select trace", error, false));
});

timelineBodyEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const row = target.closest("[data-step-index]");
  if (!(row instanceof HTMLElement)) {
    return;
  }

  const index = Number(row.dataset.stepIndex);
  if (!Number.isFinite(index) || !state.currentTrace) {
    return;
  }

  state.selectedStepIndex = index;
  renderTimeline(state.currentTrace);
  renderExplorerSteps(state.currentTrace);
  renderStepInspector(state.currentTrace, state.selectedStepIndex);
});

explorerStepListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const item = target.closest("[data-step-index]");
  if (!(item instanceof HTMLElement)) {
    return;
  }

  const index = Number(item.dataset.stepIndex);
  if (!Number.isFinite(index) || !state.currentTrace) {
    return;
  }

  state.selectedStepIndex = index;
  renderTimeline(state.currentTrace);
  renderExplorerSteps(state.currentTrace);
  renderStepInspector(state.currentTrace, state.selectedStepIndex);
});

traceSearchEl.addEventListener("input", () => renderTraceList());
traceRiskEl.addEventListener("change", () => renderTraceList());
traceSourceEl.addEventListener("change", () => renderTraceList());

// Category pill click → toggleCategory
for (const pill of categoryPills) {
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    const category = pill.dataset.category;
    if (category) toggleCategory(category);
  });
}

// Context sub-tab click (delegated)
if (contextSubTabsEl) {
  contextSubTabsEl.addEventListener("click", (event) => {
    const tab = event.target.closest(".context-sub-tab");
    if (tab && tab.dataset.subView) {
      setSubView(tab.dataset.subView);
    }
  });
}

// Context close button
if (contextCloseBtn) {
  contextCloseBtn.addEventListener("click", () => closeContextPanel());
}

for (const button of focusButtons) {
  button.addEventListener("click", () => {
    const focus = button.dataset.focus;
    if (!focus) {
      return;
    }
    setFocus(focus);
  });
}

if (firewallChatSendBtn instanceof HTMLButtonElement) {
  firewallChatSendBtn.addEventListener("click", () => {
    sendFirewallChatFromInput();
  });
}

if (firewallChatInputEl instanceof HTMLInputElement) {
  firewallChatInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendFirewallChatFromInput();
    }
  });
}

if (firewallChatRefreshBtn instanceof HTMLButtonElement) {
  firewallChatRefreshBtn.addEventListener("click", () => {
    askFirewallChat("Give me a firewall status update.", { echoUser: false });
  });
}

// ── Rotating placeholder suggestions ──
const SUGGESTION_PROMPTS = [
  "Give me a firewall status update.",
  "Why was this trace blocked?",
  "What should we do next to reduce risk?",
  "What is the current risk score?",
];

const rotatingPlaceholderEl = document.getElementById("rotatingPlaceholder");
let suggestionIndex = 0;
let suggestionTimer = null;
let suggestionActive = true;

function showNextSuggestion() {
  if (!rotatingPlaceholderEl || !suggestionActive) return;
  const text = SUGGESTION_PROMPTS[suggestionIndex % SUGGESTION_PROMPTS.length];
  rotatingPlaceholderEl.innerHTML = `<span class="placeholder-text">${text}</span>`;
  suggestionIndex++;
}

function startSuggestionRotation() {
  if (suggestionTimer) return;
  suggestionActive = true;
  if (rotatingPlaceholderEl) rotatingPlaceholderEl.classList.remove("is-hidden");
  showNextSuggestion();
  suggestionTimer = setInterval(showNextSuggestion, 3000);
}

function stopSuggestionRotation() {
  suggestionActive = false;
  if (suggestionTimer) { clearInterval(suggestionTimer); suggestionTimer = null; }
  if (rotatingPlaceholderEl) rotatingPlaceholderEl.classList.add("is-hidden");
}

if (firewallChatInputEl) {
  firewallChatInputEl.addEventListener("focus", stopSuggestionRotation);
  firewallChatInputEl.addEventListener("blur", () => {
    if (!firewallChatInputEl.value.trim()) startSuggestionRotation();
  });
  firewallChatInputEl.addEventListener("input", () => {
    if (firewallChatInputEl.value.trim()) {
      stopSuggestionRotation();
    } else if (document.activeElement !== firewallChatInputEl) {
      startSuggestionRotation();
    }
  });
}

// Keep rotating placeholder non-interactive so clicks focus the input.
if (rotatingPlaceholderEl) {
  rotatingPlaceholderEl.style.pointerEvents = "none";
  rotatingPlaceholderEl.style.cursor = "text";
}

startSuggestionRotation();

for (const pill of firewallQuickPromptButtons) {
  pill.addEventListener("click", () => {
    const prompt = pill.getAttribute("data-firewall-prompt");
    if (prompt) {
      askFirewallChat(prompt, { echoUser: true });
    }
  });
}

if (demoStartBtn instanceof HTMLButtonElement) {
  demoStartBtn.addEventListener("click", () => {
    runDemoAction("Start", runDemoStart);
  });
}

if (demoAuditBtn instanceof HTMLButtonElement) {
  demoAuditBtn.addEventListener("click", () => {
    runDemoAction("Audit", runDemoAudit);
  });
}

if (demoBlockBtn instanceof HTMLButtonElement) {
  demoBlockBtn.addEventListener("click", () => {
    runDemoAction("Block", runDemoBlock);
  });
}

if (demoForkBtn instanceof HTMLButtonElement) {
  demoForkBtn.addEventListener("click", () => {
    runDemoAction("Fork", runDemoFork);
  });
}

if (demoFullBtn instanceof HTMLButtonElement) {
  demoFullBtn.addEventListener("click", () => {
    runDemoAction("Full Flow", runDemoFull);
  });
}

if (injectEventBtn instanceof HTMLButtonElement) {
  injectEventBtn.addEventListener("click", () => {
    runInjectEvent();
  });
}

if (nodeModalCloseBtn instanceof HTMLButtonElement) {
  nodeModalCloseBtn.addEventListener("click", closeNodeModal);
}

if (nodeGuardAllowBtn instanceof HTMLButtonElement) {
  nodeGuardAllowBtn.addEventListener("click", () => {
    applyNodeGuardAction("allow").catch((error) => {
      setNodeModalStatus(`Guard action failed: ${parseErrorMessage(error)}`, "error");
    });
  });
}

if (nodeGuardBlockBtn instanceof HTMLButtonElement) {
  nodeGuardBlockBtn.addEventListener("click", () => {
    applyNodeGuardAction("block").catch((error) => {
      setNodeModalStatus(`Guard action failed: ${parseErrorMessage(error)}`, "error");
    });
  });
}

if (nodeGuardPendingBtn instanceof HTMLButtonElement) {
  nodeGuardPendingBtn.addEventListener("click", () => {
    applyNodeGuardAction("pending").catch((error) => {
      setNodeModalStatus(`Guard action failed: ${parseErrorMessage(error)}`, "error");
    });
  });
}

if (nodeForkCreateBtn instanceof HTMLButtonElement) {
  nodeForkCreateBtn.addEventListener("click", () => {
    createForkFromNode().catch((error) => {
      setNodeModalStatus(`Fork failed: ${parseErrorMessage(error)}`, "error");
    });
  });
}

if (nodeAuditBtn instanceof HTMLButtonElement) {
  nodeAuditBtn.addEventListener("click", () => {
    runNodeModalTask("Audit", runNodeAudit);
  });
}

if (nodeMlBtn instanceof HTMLButtonElement) {
  nodeMlBtn.addEventListener("click", () => {
    runNodeModalTask("ML Anomaly", runNodeMl);
  });
}

if (nodeShareBtn instanceof HTMLButtonElement) {
  nodeShareBtn.addEventListener("click", () => {
    runNodeModalTask("Share", runNodeShare);
  });
}

if (nodeSuggestBtn instanceof HTMLButtonElement) {
  nodeSuggestBtn.addEventListener("click", () => {
    runNodeModalTask("Suggest", runNodeSuggest);
  });
}

if (nodeBriefBtn instanceof HTMLButtonElement) {
  nodeBriefBtn.addEventListener("click", () => {
    runNodeModalTask("YC Brief", runNodeBrief);
  });
}

if (topologyEndpointCloseBtn instanceof HTMLButtonElement) {
  topologyEndpointCloseBtn.addEventListener("click", closeTopologyEndpointPopup);
}

if (topologyEndpointApproveBtn instanceof HTMLButtonElement) {
  topologyEndpointApproveBtn.addEventListener("click", () => {
    approveTopologyEndpointSelection();
  });
}

// Admin panel event listeners
if (marketplaceSearchBtn instanceof HTMLButtonElement) {
  marketplaceSearchBtn.addEventListener("click", () => searchMarketplace());
}
if (marketplaceSearchInput instanceof HTMLInputElement) {
  marketplaceSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchMarketplace();
  });
}
if (dispatchToolNameInput instanceof HTMLInputElement) {
  dispatchToolNameInput.addEventListener("input", () => {
    delete dispatchToolNameInput.dataset.appId;
  });
}
if (dispatchToolBtn instanceof HTMLButtonElement) {
  dispatchToolBtn.addEventListener("click", () => dispatchTool());
}
if (policyPreviewBtn instanceof HTMLButtonElement) {
  policyPreviewBtn.addEventListener("click", () => previewPolicyDecision());
}
if (policyEnforceBtn instanceof HTMLButtonElement) {
  policyEnforceBtn.addEventListener("click", () => enforcePolicyDecision());
}
if (settingsRefreshBtn instanceof HTMLButtonElement) {
  settingsRefreshBtn.addEventListener("click", () => refreshSettingsPanel());
}
if (settingsClearHistoryBtn instanceof HTMLButtonElement) {
  settingsClearHistoryBtn.addEventListener("click", () => clearTraceHistory());
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    // Priority chain: modal → topology popup → context panel
    if (nodeActionModalEl && !nodeActionModalEl.classList.contains("hidden")) {
      closeNodeModal();
      return;
    }
    if (topologyEndpointPopupEl && !topologyEndpointPopupEl.classList.contains("hidden")) {
      closeTopologyEndpointPopup();
      return;
    }
    if (state.contextPanelOpen) {
      closeContextPanel();
      return;
    }
  }
  // Arrow key navigation within category segmented control
  if (document.activeElement && document.activeElement.classList.contains("category-pill")) {
    const pills = categoryPills;
    const idx = pills.indexOf(document.activeElement);
    if (idx < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = pills[(idx + 1) % pills.length];
      next.focus();
      next.click();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const prev = pills[(idx - 1 + pills.length) % pills.length];
      prev.focus();
      prev.click();
    }
  }
});

// Click outside closes context panel (use mousedown to avoid conflict with pill click handlers)
document.addEventListener("mousedown", (event) => {
  if (!state.contextPanelOpen) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest("#nodeActionModal") ||
    target.closest(".context-panel") ||
    target.closest(".category-bar") ||
    target.closest(".chat-composer") ||
    target.closest(".topology-map") ||
    target.closest(".action-tree-canvas")
  ) return;
  closeContextPanel();
});

// popstate: restore nav state on back/forward
window.addEventListener("popstate", () => restoreNavState());

// Cleanup timers on page unload
window.addEventListener("beforeunload", () => {
  stopPolling();
  stopSuggestionRotation();
});

// Initialize chat-first dashboard
try {
  localStorage.removeItem("maple_judge_view");
  restoreNavState();
  updateMcpSnippet();
  clearLivePanels("Authenticating session...");
  renderCommunityTraces([]);
  setDemoResult("");
  resetFirewallChatLog("Ask Maple for live firewall updates.");
  setFirewallChatContext(null);
  setFirewallChatBusy(false);
  updateWelcomeState();
  // 3D graphs are lazy-initialized on first render (when container is visible)
  connectAndRefresh();
  checkChatCapabilities();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn instanceof HTMLButtonElement) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: headersWithKey(),
        });
      } catch {
        // Best-effort logout
      }
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem("maple_judge_username");
      stopPolling();
      window.location.assign("/landing");
    });
  }

  const exportTraceBtn = document.getElementById("exportTraceBtn");
  if (exportTraceBtn instanceof HTMLButtonElement) {
    exportTraceBtn.addEventListener("click", () => {
      if (!state.currentTrace) {
        setStatus("No trace selected to export.", "error");
        return;
      }
      const json = JSON.stringify(state.currentTrace, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maple-trace-${state.currentTrace.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("Trace exported.", "ok");
    });
  }
} catch (err) {
  // Initialization error — silently handled
}
