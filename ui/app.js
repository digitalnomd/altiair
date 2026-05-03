const SVG_NS = "http://www.w3.org/2000/svg";
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 390;
const TILE_SIZE = 256;
const DEFAULT_REFRESH_MS = 5000;

const fallbackState = {
  updatedAt: "2026-05-02T19:35:00-07:00",
  mission: {
    name: "Locate aerial anomaly",
    status: "5/6 nodes active - mesh stable",
  },
  fusion: {
    confidenceLabel: "Medium",
    confidenceScore: 0.74,
    latestEvent: "UAS track crossing northwest approach",
    eventLabel: "UAS Track",
    position: { x: 39.3, y: 15.2, latitude: 37.79125, longitude: -122.40355 },
    trackTrail: [
      { x: 39.7, y: 15.8, latitude: 37.79115, longitude: -122.40365 },
      { x: 42.5, y: 20.5, latitude: 37.79085, longitude: -122.40285 },
      { x: 46.8, y: 24.4, latitude: 37.79055, longitude: -122.4019 },
      { x: 52.4, y: 28.2, latitude: 37.79025, longitude: -122.40095 },
      { x: 59.7, y: 32.1, latitude: 37.79, longitude: -122.4001 },
      { x: 66.6, y: 33.6, latitude: 37.7897, longitude: -122.3992 },
    ],
    rfBearings: [
      [
        { x: 39.8, y: 16.6, latitude: 37.79125, longitude: -122.40355 },
        { x: 49.8, y: 40.5, latitude: 37.78935, longitude: -122.40125 },
        { x: 72.2, y: 65.8, latitude: 37.78722, longitude: -122.39775 },
      ],
    ],
    controlSource: {
      label: "Probable UAS Control Source",
      confidenceLabel: "Medium",
      coordinates: { latitude: 37.78928, longitude: -122.39795 },
      radiusMeters: 115,
    },
    evidence: [
      { id: "visual", label: "Visual", kind: "visual", value: 82, summary: "Camera has intermittent visual track." },
      { id: "rf", label: "RF", kind: "rf", value: 74, summary: "RF bearing intersects visual cue." },
      { id: "audio", label: "Audio", kind: "audio", value: 41, summary: "Audio cue is weak but consistent." },
      { id: "agreement", label: "3-node agreement", kind: "agreement", value: 100, summary: "Quorum agreement from three reachable nodes." },
    ],
    feed: [
      { level: "warn", title: "Fusion", text: "Visual, RF, and audio evidence converge near northwest sector." },
      { level: "good", title: "Policy", text: "Cue remains review gated; no autonomous action emitted." },
      { level: "info", title: "Freshness", text: "Latest fused estimate refreshed 11 seconds ago." },
    ],
    policyGate: "review_needed",
  },
  coordinator: {
    recommendedNextAction: "Node 2 shift east and verify visual",
    operatorNextAction: "Maintain observation. Keep object in frame. Move only if safe.",
    feed: [
      { level: "info", title: "Coordinator", text: "Hold current observation while Node 2 repositions." },
      { level: "good", title: "Deconfliction", text: "Node 1 observes; Node 3 relays; Node 4 verifies RF." },
      { level: "warn", title: "Constraint", text: "Avoid movement that breaks the current visual frame." },
    ],
    teamPulse: [
      { nodeId: "N1", task: "Observe", status: "good" },
      { nodeId: "N2", task: "Repositioning", status: "move" },
      { nodeId: "N3", task: "Relay", status: "good" },
      { nodeId: "N4", task: "RF verify", status: "warn" },
      { nodeId: "N5", task: "Low battery", status: "neutral" },
    ],
  },
  gossip: {
    feed: [
      { level: "good", title: "Mesh", text: "Five nodes reachable; quorum is intact." },
      { level: "warn", title: "Node 6", text: "Heartbeat degraded; gossip lease is still active." },
      { level: "info", title: "Gateway", text: "Node 1 remains current local coordinator." },
    ],
    nodes: [
      { id: "N1", label: "Node 1", x: 49.6, y: 48.8, latitude: 37.78806, longitude: -122.40095, status: "active", labelOffset: { x: -18, y: 30 } },
      {
        id: "N2",
        label: "Node 2",
        x: 71.7,
        y: 66.3,
        latitude: 37.78722,
        longitude: -122.39775,
        status: "active",
        labelOffset: { x: 20, y: 0 },
        fov: [
          { x: 72.2, y: 67.2, latitude: 37.78722, longitude: -122.39775 },
          { x: 78.5, y: 74.0, latitude: 37.78835, longitude: -122.39935 },
          { x: 73.8, y: 87.0, latitude: 37.78655, longitude: -122.39935 },
        ],
      },
      {
        id: "N3",
        label: "Node 3",
        x: 33.1,
        y: 74.6,
        latitude: 37.78655,
        longitude: -122.40355,
        status: "active",
        labelOffset: { x: -65, y: 8 },
        fov: [
          { x: 32.9, y: 75.4, latitude: 37.78655, longitude: -122.40355 },
          { x: 28.8, y: 86.8, latitude: 37.78762, longitude: -122.40235 },
          { x: 33.4, y: 93.4, latitude: 37.78735, longitude: -122.40475 },
        ],
      },
      {
        id: "N4",
        label: "Node 4",
        x: 28.0,
        y: 20.5,
        latitude: 37.79172,
        longitude: -122.40478,
        status: "active",
        labelOffset: { x: -56, y: -4 },
        fov: [
          { x: 28.6, y: 21.3, latitude: 37.79172, longitude: -122.40478 },
          { x: 33.2, y: 29.5, latitude: 37.79118, longitude: -122.40338 },
          { x: 30.0, y: 37.2, latitude: 37.79035, longitude: -122.40505 },
        ],
      },
      {
        id: "N5",
        label: "Node 5",
        x: 23.6,
        y: 51.8,
        latitude: 37.78832,
        longitude: -122.4058,
        status: "active",
        labelOffset: { x: -54, y: -3 },
        fov: [
          { x: 23.3, y: 52.6, latitude: 37.78832, longitude: -122.4058 },
          { x: 18.9, y: 60.0, latitude: 37.78915, longitude: -122.40445 },
          { x: 22.2, y: 67.2, latitude: 37.7873, longitude: -122.40452 },
        ],
      },
      { id: "N6", label: "Node 6", x: 74.9, y: 29.8, latitude: 37.79095, longitude: -122.3979, status: "degraded", stateLabel: "Degraded", labelOffset: { x: 18, y: 0 } },
    ],
    links: [
      ["N4", "N5"],
      ["N5", "N3"],
      ["N3", "N1"],
      ["N4", "N1"],
      ["N1", "N2"],
      ["N2", "N6"],
    ],
  },
  map: {
    objectiveAreaLabel: "Objective Area",
    geo: {
      center: { latitude: 37.78984, longitude: -122.40128 },
      zoom: 15,
      metersPerPercentX: 10,
      metersPerPercentY: 8,
      tileTemplate: "/tiles/{z}/{x}/{y}.png",
      attribution: "OpenStreetMap / local tile proxy",
      sourceLabel: "Foundry GPS / OSM fallback",
    },
    objectiveArea: [
      { x: 45.4, y: 73.7, latitude: 37.7885, longitude: -122.40185 },
      { x: 43.2, y: 70.0, latitude: 37.7885, longitude: -122.4005 },
      { x: 42.9, y: 64.2, latitude: 37.78795, longitude: -122.39998 },
      { x: 44.3, y: 58.4, latitude: 37.78725, longitude: -122.40015 },
      { x: 47.2, y: 54.6, latitude: 37.78682, longitude: -122.4012 },
      { x: 49.0, y: 51.0, latitude: 37.7872, longitude: -122.40205 },
      { x: 52.2, y: 53.0, latitude: 37.7879, longitude: -122.40218 },
      { x: 54.4, y: 52.2, latitude: 37.78835, longitude: -122.40155 },
    ],
  },
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  mapPanel: document.querySelector(".map-panel"),
  baseMap: document.querySelector("#baseMap"),
  sourceStatus: document.querySelector("#sourceStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  pauseButton: document.querySelector("#pauseButton"),
  missionClock: document.querySelector("#missionClock"),
  readinessScore: document.querySelector("#readinessScore"),
  lastUpdate: document.querySelector("#lastUpdate"),
  currentViewMode: document.querySelector("#currentViewMode"),
  mapFeedLabel: document.querySelector("#mapFeedLabel"),
  mapCoordinateReadout: document.querySelector("#mapCoordinateReadout"),
  mapAttribution: document.querySelector("#mapAttribution"),
  scanCadence: document.querySelector("#scanCadence"),
  viewModeButtons: document.querySelectorAll(".view-mode-button"),
  missionName: document.querySelector("#missionName"),
  meshStatus: document.querySelector("#meshStatus"),
  confidenceLabel: document.querySelector("#confidenceLabel"),
  latestEvent: document.querySelector("#latestEvent"),
  recommendedAction: document.querySelector("#recommendedAction"),
  operatorAction: document.querySelector("#operatorAction"),
  policyGate: document.querySelector("#policyGate"),
  mapSvg: document.querySelector("#mapSvg"),
  teamPulseItems: document.querySelector("#teamPulseItems"),
  evidenceMetrics: document.querySelector("#evidenceMetrics"),
  fusionFeed: document.querySelector("#fusionFeed"),
  coordinatorFeed: document.querySelector("#coordinatorFeed"),
  gossipFeed: document.querySelector("#gossipFeed"),
  confidenceDial: document.querySelector("#confidenceDial"),
  targetConfidenceScore: document.querySelector("#targetConfidenceScore"),
  targetConfidenceLabel: document.querySelector("#targetConfidenceLabel"),
  targetBearing: document.querySelector("#targetBearing"),
  targetGrid: document.querySelector("#targetGrid"),
  targetPolicy: document.querySelector("#targetPolicy"),
  targetMapFeed: document.querySelector("#targetMapFeed"),
  targetCallsign: document.querySelector("#targetCallsign"),
  sensorStack: document.querySelector("#sensorStack"),
  cueChain: document.querySelector("#cueChain"),
};

const app = {
  paused: false,
  timer: null,
  lastSource: "demo",
  viewMode: "fusion",
  currentState: null,
};

elements.refreshButton.addEventListener("click", () => {
  void refreshDashboard();
});

elements.pauseButton.addEventListener("click", () => {
  app.paused = !app.paused;
  elements.pauseButton.title = app.paused ? "Resume polling" : "Pause polling";
  elements.pauseButton.setAttribute("aria-label", elements.pauseButton.title);
  elements.pauseButton.innerHTML = `<svg><use href="#${app.paused ? "icon-play" : "icon-pause"}"></use></svg>`;
  elements.scanCadence.textContent = app.paused ? "polling paused / passive observe" : "5s poll / passive observe";
  if (!app.paused) {
    scheduleRefresh();
  }
});

for (const button of elements.viewModeButtons) {
  button.addEventListener("click", () => {
    setViewMode(button.dataset.viewMode ?? "fusion");
  });
}

setViewMode(app.viewMode);
updateClock();
window.setInterval(updateClock, 1000);
window.addEventListener("resize", () => {
  if (!app.currentState) {
    return;
  }
  window.requestAnimationFrame(() => renderDashboard(app.currentState));
});
void refreshDashboard();

async function refreshDashboard() {
  window.clearTimeout(app.timer);

  let state = fallbackState;
  let source = "demo";
  let error = null;

  try {
    const livePayload = await loadLivePayload();
    if (livePayload !== null) {
      state = normalizeState(livePayload);
      source = livePayload.dashboard ? "live dashboard" : "live node api";
    } else {
      const fixture = await loadFixtureState();
      if (fixture !== null) {
        state = normalizeState(fixture);
        source = "demo fixture";
      }
    }
  } catch (caught) {
    error = caught;
  }

  renderDashboard(state);
  setSourceStatus(error ? "error" : source, error);
  app.lastSource = error ? "demo" : source;
  scheduleRefresh();
}

function scheduleRefresh() {
  window.clearTimeout(app.timer);
  if (app.paused) {
    return;
  }
  app.timer = window.setTimeout(() => {
    void refreshDashboard();
  }, DEFAULT_REFRESH_MS);
}

function setViewMode(mode) {
  app.viewMode = ["fusion", "spectrum", "command"].includes(mode) ? mode : "fusion";
  elements.appShell.dataset.view = app.viewMode;
  elements.currentViewMode.textContent = capitalize(app.viewMode);
  for (const button of elements.viewModeButtons) {
    const isActive = button.dataset.viewMode === app.viewMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function updateClock() {
  elements.missionClock.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function loadLivePayload() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("source") === "demo") {
    return null;
  }

  const apiBase = params.get("api") ?? defaultApiBase();
  if (!apiBase) {
    return null;
  }

  const dashboardUrl = joinUrl(apiBase, "dashboard");
  const dashboard = await fetchJson(dashboardUrl).catch(() => null);
  if (dashboard !== null) {
    return { dashboard };
  }

  const endpoints = await Promise.allSettled([
    fetchJson(joinUrl(apiBase, "health")),
    fetchJson(joinUrl(apiBase, "topology")),
    fetchJson(joinUrl(apiBase, "peers")),
    fetchJson(joinUrl(apiBase, "gateway")),
    fetchJson(joinUrl(apiBase, "mission-continuity")),
    fetchJson(joinUrl(apiBase, "congestion")),
    fetchJson(joinUrl(apiBase, "bundles/pending")),
    fetchJson(joinUrl(apiBase, "ledger")),
    fetchJson(joinUrl(apiBase, "replication/latest")),
    fetchJson(joinUrl(apiBase, "insights/latest")),
    fetchJson(joinUrl(apiBase, "tag-plan/latest")),
    fetchJson(joinUrl(apiBase, "mission/instructions/latest")),
    fetchJson(joinUrl(apiBase, "mission/deployment/latest")),
    fetchJson(joinUrl(apiBase, "foundry/intelligence")),
    fetchJson(joinUrl(apiBase, "foundry/sync/latest")),
    fetchJson(joinUrl(apiBase, "instructions/latest")),
    fetchJson(joinUrl(apiBase, "coordinator/latest")),
    fetchJson(joinUrl(apiBase, "gossip/world")),
  ]);

  const [
    health,
    topology,
    peers,
    gateway,
    missionContinuity,
    congestion,
    pending,
    ledger,
    replication,
    insight,
    tagPlan,
    missionInstruction,
    deploymentOrder,
    foundryIntelligence,
    foundrySync,
    instructions,
    coordinator,
    gossipWorld,
  ] = endpoints.map((result) =>
    result.status === "fulfilled" ? result.value : null,
  );

  if ([health, topology, peers, gateway, congestion, pending, ledger].every((value) => value === null)) {
    return null;
  }

  return {
    nodeApi: {
      capturedAt: new Date().toISOString(),
      health,
      topology,
      peers,
      gateway,
      congestion,
      pending,
      ledger,
      missionContinuity,
      replication,
      insight,
      tagPlan,
      missionInstruction,
      deploymentOrder,
      foundryIntelligence,
      foundrySync,
      instructions,
      coordinator,
      gossipWorld,
    },
  };
}

function defaultApiBase() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return "";
  }
  return "/api";
}

async function loadFixtureState() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return null;
  }
  return fetchJson("./data/demo-state.json").catch(() => null);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function normalizeState(payload) {
  if (payload?.dashboard) {
    return normalizeState(payload.dashboard);
  }

  if (payload?.mission && payload?.fusion && payload?.coordinator && payload?.gossip) {
    const merged = mergeDeep(fallbackState, payload);
    const deploymentOrder = merged.deploymentOrder ?? merged.missionDeployment ?? merged.deployment;
    merged.deploymentOrder = deploymentOrder ?? merged.deploymentOrder;
    applyFoundryGeoContext(merged, merged.foundryIntelligence, null, deploymentOrder);
    return merged;
  }

  if (payload?.nodeApi) {
    return fromNodeApiSnapshot(payload.nodeApi);
  }

  return fallbackState;
}

function fromNodeApiSnapshot(snapshot) {
  const base = structuredClone(fallbackState);
  const health = snapshot.health ?? {};
  const topologyNodes = Array.isArray(snapshot.topology?.nodes) ? snapshot.topology.nodes : [];
  const peerRows = Array.isArray(snapshot.peers?.peers) ? snapshot.peers.peers : [];
  const pendingBundles = Array.isArray(snapshot.pending?.bundles) ? snapshot.pending.bundles : [];
  const latestBundle = pendingBundles[pendingBundles.length - 1];
  const latestCue = latestBundle?.counterUasCues?.[0];
  const latestDrone = latestBundle?.droneObservations?.[0];
  const latestEstimate = latestBundle?.controlSourceEstimates?.[0];
  const latestInsight = snapshot.insight && !snapshot.insight.error ? snapshot.insight : null;
  const latestTagPlan = snapshot.tagPlan && !snapshot.tagPlan.error ? snapshot.tagPlan : null;
  const missionInstruction = snapshot.missionInstruction && !snapshot.missionInstruction.error ? snapshot.missionInstruction : null;
  const deploymentOrderPayload = snapshot.deploymentOrder ?? snapshot.missionDeployment ?? snapshot.deployment;
  const deploymentOrder = deploymentOrderPayload && !deploymentOrderPayload.error ? deploymentOrderPayload : null;
  const foundryIntelligence = snapshot.foundryIntelligence && !snapshot.foundryIntelligence.error ? snapshot.foundryIntelligence : null;
  const foundrySync = snapshot.foundrySync && !snapshot.foundrySync.error ? snapshot.foundrySync : null;
  const localInstructions = snapshot.instructions && !snapshot.instructions.error ? snapshot.instructions : null;
  const localAssignment = localInstructions?.localAssignments?.[0];
  const localLease = deploymentOrder?.nodeLeases?.find((lease) => lease.nodeId === health.nodeId);
  const coordinatorDirective = snapshot.coordinator && !snapshot.coordinator.error ? snapshot.coordinator : null;
  const gossipWorld = snapshot.gossipWorld && !snapshot.gossipWorld.error ? snapshot.gossipWorld : coordinatorDirective?.gossipWorld ?? null;
  const missionContinuity = snapshot.missionContinuity && !snapshot.missionContinuity.error ? snapshot.missionContinuity : null;
  const replication = snapshot.replication && !snapshot.replication.error ? snapshot.replication : null;

  const peerObservationById = new Map();
  for (const peer of peerRows) {
    if (peer?.id) {
      peerObservationById.set(peer.id, peer.observation ?? {});
    }
  }
  if (health.nodeId) {
    peerObservationById.set(health.nodeId, {
      online: true,
      queueDepth: health.queueDepth,
      cpuLoad: health.cpuLoad,
      foundryReachable: health.foundryReachable,
      networkReachable: health.networkReachable,
    });
  }

  const liveNodes = topologyNodes.map((node, index) => {
    const point = liveNodePoint(node.id, index);
    const observation = peerObservationById.get(node.id) ?? {};
    const degraded = observation.online === false || (observation.queueDepth ?? 0) > 180;
    return {
      id: shortNodeId(node.id),
      sourceId: node.id,
      label: nodeLabel(node.id),
      x: point.x,
      y: point.y,
      status: degraded ? "degraded" : "active",
      stateLabel: degraded ? "Degraded" : "",
      labelOffset: point.labelOffset,
      fov: point.fov,
    };
  });

  if (liveNodes.length > 0) {
    base.gossip.nodes = liveNodes;
    base.gossip.links = buildLiveLinks(liveNodes);
  }

  const onlineCount = [...peerObservationById.values()].filter((observation) => observation.online !== false).length || liveNodes.length;
  const totalCount = liveNodes.length || topologyNodes.length || 1;
  const selectedGateway = snapshot.gateway?.selectedGatewayId ?? snapshot.gateway?.gatewayDecision?.selectedGatewayId ?? null;
  const congestion = snapshot.congestion?.congestion ?? snapshot.congestion;
  const instructionText =
    coordinatorDirective?.operatorNextAction ??
    localAssignment?.instruction ??
    localInstructions?.standby ??
    latestInsight?.recommendedNextChecks?.[0] ??
    latestCue?.recommendedNextChecks?.[0] ??
    null;

  base.updatedAt = snapshot.capturedAt ?? new Date().toISOString();
  base.foundryIntelligence = foundryIntelligence;
  base.deploymentOrder = deploymentOrder;
  base.mission.name = missionInstruction?.title ?? deploymentOrder?.title ?? base.mission.name;
  base.mission.status = missionContinuity
    ? `${onlineCount}/${totalCount} nodes active - ${formatToken(missionContinuity.status)}`
    : `${onlineCount}/${totalCount} nodes active - ${onlineCount >= 3 ? "mesh stable" : "mesh degraded"}`;
  base.fusion.confidenceScore = latestCue?.confidence ?? latestEstimate?.confidence ?? base.fusion.confidenceScore;
  if (latestInsight?.confidence !== undefined) {
    base.fusion.confidenceScore = Math.max(base.fusion.confidenceScore, latestInsight.confidence);
  }
  base.fusion.confidenceLabel = confidenceLabel(base.fusion.confidenceScore);
  base.fusion.latestEvent = latestDrone
    ? `${formatDroneClass(latestDrone.droneClass)} cue in ${latestDrone.zoneId ?? "active zone"}`
    : pendingBundles.length > 0
      ? `${pendingBundles.length} pending evidence bundle${pendingBundles.length === 1 ? "" : "s"}`
      : "No active fused event";
  base.fusion.policyGate = latestCue?.policyGate ?? latestBundle?.counterUasCues?.[0]?.policyGate ?? "review_needed";
  if (deploymentOrder?.policyDecision?.policyState) {
    base.fusion.policyGate = deploymentOrder.policyDecision.policyState;
  }
  base.fusion.evidence = evidenceFromBundle(latestBundle, base.fusion.evidence);
  base.fusion.feed = [
    ...(deploymentOrder
      ? [{
          level: deploymentOrder.state === "blocked" ? "bad" : "good",
          title: "Deployment",
          text: `${formatToken(deploymentOrder.state)} with ${deploymentOrder.nodeLeases?.length ?? 0} node leases for ${deploymentOrder.authorizedZoneId}.`,
        }]
      : []),
    {
      level: latestCue ? "warn" : "info",
      title: "Fusion",
      text: latestInsight?.summary ??
        latestCue?.evidence?.[0]?.summary ??
        "Waiting for fused cue bundle from the local LLM fusion layer.",
    },
    {
      level: base.fusion.policyGate === "authorized_to_share" ? "good" : "warn",
      title: "Policy",
      text: `Current policy gate is ${formatPolicy(base.fusion.policyGate)}.`,
    },
    ...(foundryIntelligence
      ? [{
          level: foundryIntelligence.connected ? "good" : "info",
          title: "Foundry intel",
          text: foundryIntelligence.connected
            ? `${foundryIntelligence.records?.length ?? 0} governed context records pulled for commander sync.`
            : "Foundry disconnected or mock; edge LLM continues from local cache and gossip.",
        }]
      : []),
    ...(foundrySync
      ? [{
          level: foundrySync.ack?.status === "accepted" ? "good" : "info",
          title: "Foundry output",
          text: foundrySync.commanderVisibility?.message ??
            "Latest CASK evidence package is staged for commander visibility.",
        }]
      : []),
    {
      level: congestion?.acceptBundle === false ? "bad" : "good",
      title: "Backpressure",
      text: congestion?.preferredDecision
        ? `Gateway recommends ${formatToken(congestion.preferredDecision)}.`
        : "No congestion decision received.",
    },
  ];

  base.coordinator.recommendedNextAction =
    coordinatorDirective?.recommendedNextAction ??
    instructionText ??
    (congestion?.preferredDecision ? `Coordinator fallback: ${formatToken(congestion.preferredDecision)}` : base.coordinator.recommendedNextAction);
  base.coordinator.operatorNextAction = instructionText ??
    localLease?.instruction ??
    "Maintain observation. Keep collecting compact evidence until a cue is available.";
  const assignmentByNode = new Map((latestTagPlan?.assignments ?? []).map((assignment) => [assignment.nodeId, assignment]));
  const leaseByNode = new Map((deploymentOrder?.nodeLeases ?? []).map((lease) => [lease.nodeId, lease]));
  base.coordinator.teamPulse = liveNodes.map((node) => ({
    nodeId: node.id,
    task: teamTaskLabel(node, assignmentByNode, leaseByNode, selectedGateway, health.nodeId),
    status: teamTaskStatus(node, assignmentByNode, leaseByNode, selectedGateway),
  }));
  base.coordinator.feed = [
    ...(missionInstruction
      ? [{
          level: missionInstruction.policyState === "blocked" ? "bad" : "good",
          title: "Instruction",
          text: `${missionInstruction.requestedBy ?? "Operator"} loaded ${missionInstruction.objectiveType} for ${missionInstruction.authorizedZoneId}.`,
        }]
      : []),
    {
      level: coordinatorDirective?.election?.authorityState === "leader_active" ? "good" : "warn",
      title: "Coordinator",
      text: coordinatorDirective?.election?.leaderId
        ? `${nodeLabel(coordinatorDirective.election.leaderId)} leads term ${coordinatorDirective.election.term}.`
        : "No Raft coordinator quorum; nodes continue observation-only gossip.",
    },
    {
      level: latestTagPlan ? (latestTagPlan.executionState === "blocked" ? "bad" : "warn") : "info",
      title: "Tag objective",
      text: latestTagPlan
        ? `${formatToken(latestTagPlan.executionState)} for ${latestTagPlan.subjectRef}.`
        : "No CASK tag objective has been produced yet.",
    },
    {
      level: latestInsight ? "good" : "info",
      title: "Local LLM",
      text: latestInsight
        ? latestInsight.summary
        : "No local LLM insight has been generated from live sensor events yet.",
    },
  ];

  base.gossip.feed = [
    {
      level: coordinatorDirective?.election?.authorityState === "leader_active" || onlineCount >= 3 ? "good" : "warn",
      title: "Mesh",
      text: gossipWorld?.onlineNodeIds
        ? `${gossipWorld.onlineNodeIds.length} of ${totalCount} nodes reachable through gossip; ${formatToken(coordinatorDirective?.election?.algorithm ?? "raft_single_leader")}.`
        : `${onlineCount} of ${totalCount} nodes reachable through gossip and heartbeat state.`,
    },
    {
      level: missionContinuity?.canContinueLocalFusion ? "good" : "warn",
      title: "Continuity",
      text: missionContinuity?.missionNotes?.[0] ??
        (selectedGateway ? `${nodeLabel(selectedGateway)} is current gateway candidate.` : "Gateway selection is local-only."),
    },
    {
      level: replication?.allReachableNodesHaveAllRecords || snapshot.ledger?.survivableNodeLoss ? "good" : "warn",
      title: "Replication",
      text: replication?.allReachableNodesHaveAllRecords
        ? "All reachable nodes have the latest CASK records."
        : snapshot.ledger?.storedRecordCount
          ? `${snapshot.ledger.storedRecordCount} replicated records visible locally.`
          : "No replicated records reported yet.",
    },
    ...(foundryIntelligence
      ? [{
          level: foundryIntelligence.connected ? "good" : "info",
          title: "Commander sync",
          text: foundryIntelligence.recommendedLocalUses?.[4] ??
            "Queue what happened back to Foundry/CASK when a gateway reconnects.",
        }]
      : []),
  ];

  applyFoundryGeoContext(base, foundryIntelligence, latestBundle, deploymentOrder);

  return base;
}

function teamTaskLabel(node, assignmentByNode, leaseByNode, selectedGateway, healthNodeId) {
  const assignment = assignmentByNode.get(node.sourceId);
  const lease = leaseByNode.get(node.sourceId);
  if (node.status === "degraded") {
    return "Degraded";
  }
  if (assignment) {
    return formatToken(assignment.role);
  }
  if (lease?.roles?.length) {
    return formatToken(lease.roles[0]);
  }
  if (selectedGateway === node.sourceId) {
    return "Gateway";
  }
  if (node.id === shortNodeId(healthNodeId)) {
    return "Local";
  }
  return "Peer";
}

function teamTaskStatus(node, assignmentByNode, leaseByNode, selectedGateway) {
  const assignment = assignmentByNode.get(node.sourceId);
  const lease = leaseByNode.get(node.sourceId);
  if (node.status === "degraded") {
    return "warn";
  }
  if (assignment?.role === "guide_to_checkpoint") {
    return "move";
  }
  if (assignment || selectedGateway === node.sourceId) {
    return "good";
  }
  if (lease?.state === "assigned") {
    return "good";
  }
  if (lease?.state === "standby") {
    return "warn";
  }
  return "neutral";
}

function evidenceFromBundle(bundle, fallback) {
  if (!bundle) {
    return fallback;
  }
  const events = Array.isArray(bundle.sensorEvents) ? bundle.sensorEvents : [];
  const byKind = (kind) => events.filter((event) => event.kind === kind);
  const visual = byKind("camera");
  const rf = [...byKind("rfid"), ...byKind("provider_style_location")];
  const audio = byKind("audio");
  const agreement = new Set(events.map((event) => event.sourceNodeId)).size;

  return [
    {
      id: "visual",
      label: "Visual",
      kind: "visual",
      value: percent(averageConfidence(visual)),
      summary: visual[0]?.detectionClass ?? "No visual event in latest bundle.",
    },
    {
      id: "rf",
      label: "RF",
      kind: "rf",
      value: percent(averageConfidence(rf)),
      summary: rf[0]?.zoneId ?? "No RF/location event in latest bundle.",
    },
    {
      id: "audio",
      label: "Audio",
      kind: "audio",
      value: percent(averageConfidence(audio)),
      summary: audio[0]?.acousticClass ?? "No audio event in latest bundle.",
    },
    {
      id: "agreement",
      label: `${agreement || 0}-node agreement`,
      kind: "agreement",
      value: Math.min(100, agreement * 34),
      summary: `${agreement || 0} source nodes contributed evidence.`,
    },
  ];
}

function averageConfidence(events) {
  if (!events.length) {
    return 0;
  }
  return events.reduce((total, event) => total + (event.confidence ?? 0), 0) / events.length;
}

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function liveNodePoint(nodeId, index) {
  const points = {
    "altiair-hub": { x: 49.6, y: 48.8, latitude: 37.78806, longitude: -122.40095, labelOffset: { x: -18, y: 30 } },
    "altiair-node-a": {
      x: 33.1,
      y: 74.6,
      latitude: 37.78655,
      longitude: -122.40355,
      labelOffset: { x: -65, y: 8 },
      fov: [
        { x: 32.9, y: 75.4, latitude: 37.78655, longitude: -122.40355 },
        { x: 28.8, y: 86.8, latitude: 37.78762, longitude: -122.40235 },
        { x: 33.4, y: 93.4, latitude: 37.78735, longitude: -122.40475 },
      ],
    },
    "altiair-node-b": {
      x: 23.6,
      y: 51.8,
      latitude: 37.78832,
      longitude: -122.4058,
      labelOffset: { x: -54, y: -3 },
      fov: [
        { x: 23.3, y: 52.6, latitude: 37.78832, longitude: -122.4058 },
        { x: 18.9, y: 60.0, latitude: 37.78915, longitude: -122.40445 },
        { x: 22.2, y: 67.2, latitude: 37.7873, longitude: -122.40452 },
      ],
    },
    "altiair-orin": {
      x: 71.7,
      y: 66.3,
      latitude: 37.78722,
      longitude: -122.39775,
      labelOffset: { x: 20, y: 0 },
      fov: [
        { x: 72.2, y: 67.2, latitude: 37.78722, longitude: -122.39775 },
        { x: 78.5, y: 74.0, latitude: 37.78835, longitude: -122.39935 },
        { x: 73.8, y: 87.0, latitude: 37.78655, longitude: -122.39935 },
      ],
    },
  };
  return points[nodeId] ?? {
    x: 22 + ((index * 17) % 58),
    y: 22 + ((index * 23) % 58),
    labelOffset: { x: 18, y: 0 },
  };
}

function buildLiveLinks(nodes) {
  if (nodes.length < 2) {
    return [];
  }
  const hub = nodes.find((node) => node.sourceId === "altiair-hub") ?? nodes[0];
  return nodes
    .filter((node) => node.id !== hub.id)
    .map((node) => [hub.id, node.id]);
}

function applyFoundryGeoContext(base, foundryIntelligence, latestBundle, deploymentOrder) {
  const deploymentGeo = geoDeploymentFromPayload(deploymentOrder) ?? geoDeploymentFromFoundry(foundryIntelligence);
  const bundleGeo = geoLocationFromBundle(latestBundle);
  const foundryGeo = geoLocationFromFoundry(foundryIntelligence);
  const selected = deploymentGeo ?? bundleGeo ?? foundryGeo;
  if (!selected) {
    return;
  }

  if (selected.objectiveArea?.length) {
    base.map.objectiveArea = selected.objectiveArea;
    base.map.objectiveAreaLabel = selected.objectiveAreaLabel ?? base.map.objectiveAreaLabel;
  }
  if (selected.nodes?.length) {
    applyNodeGeoOverrides(base.gossip.nodes, selected.nodes);
  }
  if (selected.trackTrail?.length) {
    base.fusion.trackTrail = selected.trackTrail;
    base.fusion.position = selected.position ?? selected.trackTrail[selected.trackTrail.length - 1];
    base.fusion.latestEvent = selected.latestEvent ?? base.fusion.latestEvent;
    base.fusion.eventLabel = selected.eventLabel ?? base.fusion.eventLabel;
  } else if (selected.position) {
    base.fusion.position = selected.position;
  }
  if (selected.controlSource) {
    base.fusion.controlSource = selected.controlSource;
  }

  base.map.geo = {
    ...base.map.geo,
    center: selected.center ?? base.map.geo.center ?? fallbackState.map.geo.center,
    zoom: selected.zoom ?? base.map.geo.zoom,
    sourceLabel: selected.sourceLabel,
    attribution: selected.attribution ?? base.map.geo.attribution,
  };
}

function mapGeoContext(state) {
  const base = {
    ...fallbackState.map.geo,
    ...(state.map?.geo ?? {}),
  };
  const deploymentGeo = geoDeploymentFromPayload(state.deploymentOrder) ?? geoDeploymentFromFoundry(state.foundryIntelligence);
  if (deploymentGeo?.center) {
    return {
      ...base,
      center: deploymentGeo.center,
      zoom: deploymentGeo.zoom ?? base.zoom,
      sourceLabel: deploymentGeo.sourceLabel,
      attribution: deploymentGeo.attribution ?? base.attribution,
    };
  }
  const foundryGeo = geoLocationFromFoundry(state.foundryIntelligence);
  if (!foundryGeo) {
    return base;
  }
  return {
    ...base,
    center: foundryGeo.center,
    zoom: foundryGeo.zoom ?? base.zoom,
    sourceLabel: foundryGeo.sourceLabel,
    attribution: foundryGeo.attribution ?? base.attribution,
  };
}

function geoDeploymentFromFoundry(foundryIntelligence) {
  const records = Array.isArray(foundryIntelligence?.records) ? foundryIntelligence.records : [];
  for (const record of records) {
    const objectName = `${record.objectApiName ?? ""} ${record.objectExportName ?? ""}`;
    if (!/(deployment|mission|zone|track|cue|coordinator|map)/i.test(objectName)) {
      continue;
    }
    const geo = geoDeploymentFromPayload(record.payloadJson ?? record.payload ?? record.properties ?? record);
    if (!geo) {
      continue;
    }
    const sourcePrefix = foundryIntelligence.connected ? "Foundry OSDK deployment" : "Foundry deployment fixture";
    return {
      ...geo,
      sourceLabel: `${sourcePrefix}: ${record.objectApiName ?? record.objectExportName ?? "mission geo"}`,
      attribution: geo.attribution ?? "Foundry mission deployment / local tile proxy",
    };
  }
  return null;
}

function geoDeploymentFromPayload(payload) {
  payload = payloadObject(payload);
  if (!isPlainObject(payload)) {
    return null;
  }

  const map = isPlainObject(payload.map) ? payload.map : {};
  const geo = isPlainObject(payload.geo) ? payload.geo : {};
  const center = coordinateFromValue(map.center) ??
    coordinateFromValue(geo.center) ??
    coordinateFromValue(payload.center) ??
    coordinateFromValue(payload.location) ??
    geoFromPayload(payload);
  const objectiveArea = geoPolygonFromValue(payload.objectiveArea) ??
    geoPolygonFromValue(payload.authorizedZone) ??
    geoPolygonFromValue(payload.missionArea) ??
    geoPolygonFromValue(payload.area) ??
    geoPolygonFromValue(payload.bounds) ??
    geoPolygonFromValue(payload.geometry) ??
    geoPolygonFromValue(geo.objectiveArea) ??
    geoPolygonFromValue(map.objectiveArea);
  const nodes = geoNodesFromPayload(payload.nodes) ??
    geoNodesFromPayload(payload.nodeLeases) ??
    geoNodesFromPayload(payload.leases);
  const trackTrail = geoTrackFromValue(payload.uasTrack) ??
    geoTrackFromValue(payload.droneTrack) ??
    geoTrackFromValue(payload.trackTrail) ??
    geoTrackFromValue(payload.flightPath) ??
    geoTrackFromValue(payload.geometry);
  const position = coordinateFromValue(payload.uasPosition) ??
    coordinateFromValue(payload.dronePosition) ??
    coordinateFromValue(payload.latestPosition);
  const controlSourceCoordinate = coordinateFromValue(payload.controlSource) ??
    coordinateFromValue(payload.controlSourceEstimate);
  const controlSource = controlSourceCoordinate
    ? {
        ...(isPlainObject(payload.controlSource) ? payload.controlSource : {}),
        label: stringValue(payload.controlSource?.label) ?? "Probable UAS Control Source",
        coordinates: controlSourceCoordinate,
        radiusMeters: numberValue(payload.controlSource?.radiusMeters ?? payload.controlSourceEstimate?.confidenceRingMeters) ?? 115,
      }
    : null;

  if (!center && !objectiveArea?.length && !nodes?.length && !trackTrail?.length && !position && !controlSource) {
    return null;
  }

  return {
    center: center ?? position ?? trackTrail?.[trackTrail.length - 1] ?? objectiveArea?.[0] ?? controlSourceCoordinate,
    zoom: numberValue(map.zoom ?? geo.zoom ?? payload.zoom) ?? undefined,
    sourceLabel: stringValue(payload.sourceLabel) ?? "Mission deployment geospatial",
    attribution: stringValue(payload.attribution) ?? undefined,
    objectiveArea,
    objectiveAreaLabel: stringValue(payload.objectiveAreaLabel ?? payload.authorizedZoneId) ?? undefined,
    nodes,
    trackTrail,
    position,
    controlSource,
    latestEvent: stringValue(payload.latestEvent) ?? undefined,
    eventLabel: stringValue(payload.eventLabel) ?? undefined,
  };
}

function payloadObject(value) {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function geoPolygonFromValue(value) {
  if (Array.isArray(value)) {
    const points = value.map(coordinateFromValue).filter(Boolean);
    return points.length >= 3 ? points : null;
  }
  if (isPlainObject(value)) {
    if (value.type === "Feature") {
      return geoPolygonFromValue(value.geometry);
    }
    if (value.type === "Polygon" && Array.isArray(value.coordinates?.[0])) {
      const points = value.coordinates[0]
        .map(([longitude, latitude]) => isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null)
        .filter(Boolean);
      return points.length >= 3 ? points : null;
    }
    if (value.type === "MultiPolygon" && Array.isArray(value.coordinates?.[0]?.[0])) {
      const points = value.coordinates[0][0]
        .map(([longitude, latitude]) => isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null)
        .filter(Boolean);
      return points.length >= 3 ? points : null;
    }
    return geoPolygonFromValue(value.coordinates ?? value.points ?? value.vertices);
  }
  return null;
}

function geoTrackFromValue(value) {
  if (isPlainObject(value)) {
    if (value.type === "Feature") {
      return geoTrackFromValue(value.geometry);
    }
    if (value.type === "LineString" && Array.isArray(value.coordinates)) {
      const points = value.coordinates
        .map(([longitude, latitude]) => isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null)
        .filter(Boolean);
      return points.length >= 2 ? points : null;
    }
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const points = value.map(coordinateFromValue).filter(Boolean);
  return points.length >= 2 ? points : null;
}

function geoNodesFromPayload(value) {
  const entries = Array.isArray(value)
    ? value.map((item) => [null, item])
    : isPlainObject(value)
      ? Object.entries(value)
      : null;
  if (!entries) {
    return null;
  }
  const nodes = entries
    .map(([key, item]) => {
      const coordinate = coordinateFromValue(item);
      if (!coordinate) {
        return null;
      }
      return {
        id: stringValue(item.id ?? item.nodeId ?? item.sourceId ?? key),
        sourceId: stringValue(item.sourceId ?? item.nodeId ?? item.id ?? key),
        label: stringValue(item.label ?? item.hostname ?? item.nodeId ?? key),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        fov: geoPolygonFromValue(item.fov),
      };
    })
    .filter(Boolean);
  return nodes.length ? nodes : null;
}

function applyNodeGeoOverrides(nodes, geoNodes) {
  const byId = new Map();
  for (const node of geoNodes) {
    for (const key of [node.id, node.sourceId, node.label].filter(Boolean)) {
      byId.set(String(key), node);
    }
  }
  for (const node of nodes) {
    const override = byId.get(node.id) ?? byId.get(node.sourceId) ?? byId.get(node.label);
    if (!override) {
      continue;
    }
    node.latitude = override.latitude;
    node.longitude = override.longitude;
    if (override.fov?.length) {
      node.fov = override.fov;
    }
  }
}

function geoLocationFromBundle(bundle) {
  const fix = bundle?.locationFixes?.find((item) => item?.coordinates?.latitude !== undefined && item?.coordinates?.longitude !== undefined);
  if (!fix) {
    return null;
  }
  return {
    center: {
      latitude: fix.coordinates.latitude,
      longitude: fix.coordinates.longitude,
    },
    zoom: 16,
    sourceLabel: `CASK ${formatToken(fix.sourceType)} fix`,
    attribution: "CASK location fix / local tile proxy",
  };
}

function geoLocationFromFoundry(foundryIntelligence) {
  const records = Array.isArray(foundryIntelligence?.records) ? foundryIntelligence.records : [];
  for (const record of records) {
    const center = geoFromPayload(record.payloadJson);
    if (!center) {
      continue;
    }
    const sourcePrefix = foundryIntelligence.connected ? "Foundry OSDK" : "Foundry mock";
    return {
      center,
      zoom: 15,
      sourceLabel: `${sourcePrefix}: ${record.objectApiName ?? record.objectExportName ?? "Geo object"}`,
      attribution: "Foundry geospatial object / local tile proxy",
    };
  }
  return null;
}

function geoFromPayload(value, depth = 0) {
  if (!isPlainObject(value) || depth > 4) {
    return null;
  }

  const direct = latLonFromObject(value);
  if (direct) {
    return direct;
  }

  const coordinates = value.coordinates;
  if (isPlainObject(coordinates)) {
    const nested = latLonFromObject(coordinates);
    if (nested) {
      return nested;
    }
  }

  const geometry = value.geometry;
  if (isPlainObject(geometry) && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [longitude, latitude] = geometry.coordinates;
    if (isFiniteCoordinate(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  for (const child of Object.values(value)) {
    const nested = geoFromPayload(child, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function latLonFromObject(value) {
  const latitude = numberValue(value.latitude ?? value.lat);
  const longitude = numberValue(value.longitude ?? value.lon ?? value.lng);
  return isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function isFiniteCoordinate(latitude, longitude) {
  return typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -85 &&
    latitude <= 85 &&
    longitude >= -180 &&
    longitude <= 180;
}

function renderBaseMap(geoContext, dimensions) {
  const template = geoContext.tileTemplate ?? fallbackState.map.geo.tileTemplate;
  const zoom = Math.max(1, Math.min(19, Math.round(geoContext.zoom ?? 15)));
  const center = geoToWorldPixel(geoContext.center, zoom);
  const topLeft = {
    x: center.x - dimensions.width / 2,
    y: center.y - dimensions.height / 2,
  };
  const startX = Math.floor(topLeft.x / TILE_SIZE);
  const endX = Math.floor((topLeft.x + dimensions.width) / TILE_SIZE);
  const startY = Math.floor(topLeft.y / TILE_SIZE);
  const endY = Math.floor((topLeft.y + dimensions.height) / TILE_SIZE);
  const tileCount = 2 ** zoom;
  const tiles = [];

  for (let tileY = startY; tileY <= endY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) {
      continue;
    }
    for (let tileX = startX; tileX <= endX; tileX += 1) {
      const wrappedX = modulo(tileX, tileCount);
      const image = document.createElement("img");
      image.className = "base-map-tile";
      image.alt = "";
      image.decoding = "async";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.src = tileUrl(template, zoom, wrappedX, tileY);
      image.style.left = `${(((tileX * TILE_SIZE) - topLeft.x) / dimensions.width) * 100}%`;
      image.style.top = `${(((tileY * TILE_SIZE) - topLeft.y) / dimensions.height) * 100}%`;
      image.style.width = `${(TILE_SIZE / dimensions.width) * 100}%`;
      image.style.height = `${(TILE_SIZE / dimensions.height) * 100}%`;
      tiles.push(image);
    }
  }

  elements.baseMap.replaceChildren(...tiles);
}

function geoToWorldPixel(coordinate, zoom) {
  const latitude = clamp(coordinate.latitude, -85.05112878, 85.05112878);
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((coordinate.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function percentToGeo(percentPoint, geoContext) {
  const center = geoContext.center;
  const dxMeters = (percentPoint.x - 50) * (geoContext.metersPerPercentX ?? 14);
  const dyMeters = (50 - percentPoint.y) * (geoContext.metersPerPercentY ?? 10);
  const latitude = center.latitude + dyMeters / 111_320;
  const longitude = center.longitude + dxMeters / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return { latitude, longitude };
}

function tileUrl(template, zoom, x, y) {
  return template
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));
}

function measureMapDimensions() {
  const rect = elements.mapPanel?.getBoundingClientRect();
  return {
    width: Math.max(280, Math.round(rect?.width || MAP_WIDTH)),
    height: Math.max(220, Math.round(rect?.height || MAP_HEIGHT)),
  };
}

function isCompactMap(dimensions) {
  return dimensions.width < 560;
}

function renderDashboard(state) {
  app.currentState = state;
  const confidenceScore = percent(state.fusion.confidenceScore ?? 0);
  const readinessScore = computeReadinessScore(state);
  const geoContext = mapGeoContext(state);
  const targetGeo = coordinateFromValue(state.fusion.position) ?? percentToGeo(state.fusion.position, geoContext);

  elements.missionName.textContent = state.mission.name;
  elements.meshStatus.textContent = state.mission.status;
  elements.confidenceLabel.textContent = state.fusion.confidenceLabel;
  elements.confidenceLabel.className = confidenceClass(state.fusion.confidenceLabel);
  elements.latestEvent.textContent = state.fusion.latestEvent;
  elements.recommendedAction.textContent = state.coordinator.recommendedNextAction;
  elements.operatorAction.textContent = state.coordinator.operatorNextAction;
  elements.policyGate.textContent = formatPolicy(state.fusion.policyGate);
  elements.policyGate.className = `policy-pill ${policyClass(state.fusion.policyGate)}`;
  elements.lastUpdate.textContent = formatUpdatedAt(state.updatedAt);
  elements.readinessScore.textContent = `${readinessScore}%`;
  elements.scanCadence.textContent = app.paused ? "polling paused / passive observe" : "5s poll / passive observe";
  elements.targetCallsign.textContent = state.fusion.eventLabel ? callsignFromLabel(state.fusion.eventLabel) : "HK-FUSED-01";
  elements.targetConfidenceScore.textContent = `${confidenceScore}%`;
  elements.targetConfidenceLabel.textContent = `${state.fusion.confidenceLabel} confidence`;
  elements.confidenceDial.style.setProperty("--score", `${confidenceScore}%`);
  elements.targetBearing.textContent = bearingFromPosition(state.fusion.position, geoContext);
  elements.targetGrid.textContent = formatLatLon(targetGeo);
  elements.targetPolicy.textContent = formatPolicy(state.fusion.policyGate);
  elements.targetMapFeed.textContent = geoContext.sourceLabel;
  elements.mapFeedLabel.textContent = geoContext.sourceLabel;
  elements.mapCoordinateReadout.textContent = `Center ${formatLatLon(geoContext.center)} / z${geoContext.zoom}`;
  elements.mapAttribution.textContent = geoContext.attribution;

  const mapDimensions = measureMapDimensions();
  elements.mapSvg.setAttribute("viewBox", `0 0 ${mapDimensions.width} ${mapDimensions.height}`);
  renderBaseMap(geoContext, mapDimensions);
  renderMap(state, mapDimensions);
  renderTeamPulse(state.coordinator.teamPulse);
  renderEvidence(state.fusion.evidence);
  renderSensorStack(state.fusion.evidence);
  renderCueChain(state, confidenceScore);
  renderFeed(elements.fusionFeed, state.fusion.feed);
  renderFeed(elements.coordinatorFeed, state.coordinator.feed);
  renderFeed(elements.gossipFeed, state.gossip.feed);
}

function renderMap(state, dimensions) {
  const svg = elements.mapSvg;
  const geoContext = mapGeoContext(state);
  const compact = isCompactMap(dimensions);
  clearNode(svg);
  appendDefs(svg);
  renderGrid(svg, dimensions);
  if (!compact) {
    renderTerrain(svg, dimensions);
  }
  renderRangeRings(svg, state.fusion.position, geoContext, dimensions);
  if (!compact) {
    renderSectorSweep(svg, dimensions);
  }

  const objective = state.map.objectiveArea.map((item) => mapPoint(item, geoContext, dimensions));
  append("polygon", svg, {
    class: "objective-area",
    points: objective.map((p) => `${p.x},${p.y}`).join(" "),
  });
  renderObjectiveHatch(svg, objective);

  if (!compact) {
    const objectiveLabelPoint = polygonCenter(objective, dimensions);
    append("text", svg, {
      class: "map-objective-label",
      x: objectiveLabelPoint.x,
      y: objectiveLabelPoint.y,
    }, state.map.objectiveAreaLabel);
  }

  const nodeById = new Map(state.gossip.nodes.map((node) => [node.id, node]));
  if (!compact) {
    for (const node of state.gossip.nodes) {
      if (Array.isArray(node.fov)) {
        append("polygon", svg, {
          class: "fov-shape",
          points: node.fov.map((item) => mapPoint(item, geoContext, dimensions)).map((p) => `${p.x},${p.y}`).join(" "),
        });
      }
    }
  }

  if (!compact) {
    for (const bearing of state.fusion.rfBearings ?? []) {
      append("path", svg, {
        class: "rf-bearing-path",
        d: polylinePath(bearing.map((item) => mapPoint(item, geoContext, dimensions))),
      });
    }
  }

  for (const [fromId, toId] of state.gossip.links) {
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) {
      continue;
    }
    const fromPoint = mapPoint(from, geoContext, dimensions);
    const toPoint = mapPoint(to, geoContext, dimensions);
    const linkPath = `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;
    append("path", svg, { class: "mesh-link-path", d: linkPath });
    append("path", svg, { class: "mesh-link-flow", d: linkPath });
  }

  append("path", svg, {
    class: "track-path",
    d: polylinePath((state.fusion.trackTrail ?? []).map((item) => mapPoint(item, geoContext, dimensions))),
  });
  renderTrackPips(svg, state.fusion.trackTrail ?? [], geoContext, dimensions);
  renderControlSource(svg, state.fusion.controlSource, geoContext, dimensions);

  renderDetection(svg, state.fusion, geoContext, dimensions);

  for (const node of state.gossip.nodes) {
    renderNode(svg, node, geoContext, dimensions);
  }
}

function appendDefs(svg) {
  const defs = append("defs", svg);
  const glow = append("filter", defs, { id: "softGlow", x: "-70%", y: "-70%", width: "240%", height: "240%" });
  append("feGaussianBlur", glow, { stdDeviation: "4", result: "blur" });
  const merge = append("feMerge", glow);
  append("feMergeNode", merge, { in: "blur" });
  append("feMergeNode", merge, { in: "SourceGraphic" });
  const sweep = append("linearGradient", defs, { id: "sweepGradient", x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
  append("stop", sweep, { offset: "0%", "stop-color": "rgba(0, 0, 0, 0)" });
  append("stop", sweep, { offset: "55%", "stop-color": "rgba(29, 215, 223, 0.08)" });
  append("stop", sweep, { offset: "100%", "stop-color": "rgba(255, 192, 67, 0.2)" });
}

function renderGrid(svg, dimensions) {
  const xStep = Math.max(80, Math.round(dimensions.width / 8));
  const yStep = Math.max(58, Math.round(dimensions.height / 6));
  for (let x = xStep; x < dimensions.width; x += xStep) {
    append("line", svg, {
      class: `map-grid-line ${Math.round(x / xStep) % 2 === 0 ? "map-grid-major" : ""}`,
      x1: x,
      y1: 0,
      x2: x,
      y2: dimensions.height,
    });
  }
  for (let y = yStep; y < dimensions.height; y += yStep) {
    append("line", svg, {
      class: `map-grid-line ${Math.round(y / yStep) % 2 === 0 ? "map-grid-major" : ""}`,
      x1: 0,
      y1: y,
      x2: dimensions.width,
      y2: y,
    });
  }
}

function renderTerrain(svg, dimensions) {
  const lineCount = Math.max(12, Math.round(dimensions.height / 18));
  for (let i = 0; i < lineCount; i += 1) {
    const startY = 16 + i * (dimensions.height / lineCount);
    let d = `M 0 ${startY}`;
    for (let x = 0; x <= dimensions.width; x += 60) {
      const y = startY + Math.sin((x + i * 31) / 74) * 10 + Math.cos((x + i * 19) / 39) * 4;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    append("path", svg, { class: "terrain-line", d });
  }
}

function renderRangeRings(svg, position, geoContext, dimensions) {
  const center = mapPoint(position, geoContext, dimensions);
  for (const [index, radiusMeters] of [120, 240, 360, 480].entries()) {
    const radius = metersToMapPixels(radiusMeters, geoContext);
    append("circle", svg, {
      class: `range-ring range-ring-${index + 1}`,
      cx: center.x,
      cy: center.y,
      r: radius,
    });
  }
  append("path", svg, {
    class: "range-axis",
    d: `M ${center.x} 0 L ${center.x} ${dimensions.height} M 0 ${center.y} L ${dimensions.width} ${center.y}`,
  });
}

function renderSectorSweep(svg, dimensions) {
  append("polygon", svg, {
    class: "sector-sweep",
    points: [
      `${dimensions.width * 0.05},0`,
      `${dimensions.width * 0.86},0`,
      `${dimensions.width * 0.68},${dimensions.height}`,
      `${dimensions.width * 0.0},${dimensions.height}`,
    ].join(" "),
  });
  if (!isCompactMap(dimensions)) {
    append("text", svg, {
      class: "sector-label",
      x: dimensions.width - 156,
      y: 34,
    }, "HAWKEYE PASSIVE FUSION");
  }
}

function renderTrackPips(svg, trail, geoContext, dimensions) {
  trail.map((item) => mapPoint(item, geoContext, dimensions)).forEach((trailPoint, index) => {
    append("circle", svg, {
      class: "track-pip",
      cx: trailPoint.x,
      cy: trailPoint.y,
      r: 3 + index * 0.32,
      style: `--pip-delay: ${index * 80}ms`,
    });
  });
}

function renderControlSource(svg, controlSource, geoContext, dimensions) {
  if (!controlSource) {
    return;
  }
  const center = mapPoint(controlSource.coordinates ?? controlSource, geoContext, dimensions);
  const radius = metersToMapPixels(controlSource.radiusMeters ?? 90, geoContext);
  append("ellipse", svg, {
    class: "control-source-area",
    cx: center.x,
    cy: center.y,
    rx: radius * 1.45,
    ry: radius * 0.82,
  });
  append("path", svg, {
    class: "control-source-cross",
    d: `M ${center.x - 12} ${center.y} L ${center.x + 12} ${center.y} M ${center.x} ${center.y - 12} L ${center.x} ${center.y + 12}`,
  });
  if (!isCompactMap(dimensions)) {
    append("text", svg, {
      class: "control-source-label",
      x: center.x + radius * 0.9,
      y: center.y - radius * 0.65,
    }, controlSource.label ?? "Probable control source");
  }
}

function renderObjectiveHatch(svg, polygonPoints) {
  const defs = svg.querySelector("defs");
  const clip = append("clipPath", defs, { id: "objectiveClip" });
  append("polygon", clip, {
    points: polygonPoints.map((p) => `${p.x},${p.y}`).join(" "),
  });
  const group = append("g", svg, { "clip-path": "url(#objectiveClip)" });
  const minX = Math.min(...polygonPoints.map((p) => p.x));
  const maxX = Math.max(...polygonPoints.map((p) => p.x));
  const minY = Math.min(...polygonPoints.map((p) => p.y));
  const maxY = Math.max(...polygonPoints.map((p) => p.y));
  for (let x = minX - 30; x < maxX + 30; x += 12) {
    append("line", group, {
      class: "objective-hatch",
      x1: x,
      y1: maxY,
      x2: x + (maxY - minY),
      y2: minY,
    });
  }
}

function renderDetection(svg, fusion, geoContext, dimensions) {
  const center = mapPoint(fusion.position, geoContext, dimensions);
  const compact = isCompactMap(dimensions);
  const windowWidth = compact ? 82 : 128;
  const windowHeight = compact ? 62 : 90;
  append("rect", svg, {
    class: "target-window",
    x: center.x - windowWidth / 2,
    y: center.y - windowHeight / 2,
    width: windowWidth,
    height: windowHeight,
    rx: 2,
  });
  append("path", svg, {
    class: "target-brackets",
    d: [
      `M ${center.x - windowWidth / 2 - 12} ${center.y - windowHeight / 2 - 9} h 22 M ${center.x - windowWidth / 2 - 12} ${center.y - windowHeight / 2 - 9} v 22`,
      `M ${center.x + windowWidth / 2 + 12} ${center.y - windowHeight / 2 - 9} h -22 M ${center.x + windowWidth / 2 + 12} ${center.y - windowHeight / 2 - 9} v 22`,
      `M ${center.x - windowWidth / 2 - 12} ${center.y + windowHeight / 2 + 9} h 22 M ${center.x - windowWidth / 2 - 12} ${center.y + windowHeight / 2 + 9} v -22`,
      `M ${center.x + windowWidth / 2 + 12} ${center.y + windowHeight / 2 + 9} h -22 M ${center.x + windowWidth / 2 + 12} ${center.y + windowHeight / 2 + 9} v -22`,
    ].join(" "),
  });
  for (const radius of (compact ? [18, 30] : [22, 36, 50])) {
    append("circle", svg, {
      class: "detection-ring",
      cx: center.x,
      cy: center.y,
      r: radius,
      "stroke-width": radius === 22 ? 1.2 : 0.8,
    });
  }
  append("circle", svg, {
    class: "detection-core",
    cx: center.x,
    cy: center.y,
    r: 22,
    filter: "url(#softGlow)",
  });
  append("path", svg, {
    class: "detection-cross",
    d: `M ${center.x - 10} ${center.y} L ${center.x + 10} ${center.y} M ${center.x} ${center.y - 10} L ${center.x} ${center.y + 10}`,
  });
  append("circle", svg, {
    class: "detection-cross",
    cx: center.x,
    cy: center.y,
    r: 5.5,
  });
  append("path", svg, {
    class: "uas-glyph",
    d: `M ${center.x} ${center.y - 18} l 8 18 h -5 l -3 8 l -3 -8 h -5 z`,
  });
  if (!compact) {
    append("text", svg, {
      class: "detection-label",
      x: center.x + 56,
      y: center.y - 14,
    }, fusion.eventLabel);
    append("text", svg, {
      class: "detection-label",
      x: center.x + 56,
      y: center.y + 4,
    }, `Confidence: ${fusion.confidenceLabel}`);
    append("text", svg, {
      class: "detection-meta",
      x: center.x + 56,
      y: center.y + 24,
    }, formatLatLon(coordinateFromValue(fusion.position) ?? percentToGeo(fusion.position, geoContext)));
  }
}

function renderNode(svg, node, geoContext, dimensions) {
  const pos = mapPoint(node, geoContext, dimensions);
  const compact = isCompactMap(dimensions);
  const group = append("g", svg, { class: `node-group ${node.status === "degraded" ? "degraded" : ""}` });
  append("circle", group, { class: "node-halo", cx: pos.x, cy: pos.y, r: compact ? 13 : 19 });
  append("circle", group, { class: "node-outer", cx: pos.x, cy: pos.y, r: compact ? 7 : 10, filter: "url(#softGlow)" });
  append("circle", group, { class: "node-middle", cx: pos.x, cy: pos.y, r: compact ? 4.8 : 6.5 });
  append("circle", group, { class: "node-core", cx: pos.x, cy: pos.y, r: compact ? 2.5 : 3.3 });
  if (compact) {
    return;
  }

  const labelOffset = node.labelOffset ?? { x: 16, y: -10 };
  append("text", group, {
    class: `node-label ${node.status === "degraded" ? "degraded" : ""}`,
    x: pos.x + labelOffset.x,
    y: pos.y + labelOffset.y,
  }, node.label);

  if (node.stateLabel) {
    append("text", group, {
      class: "node-state-text",
      x: pos.x + labelOffset.x,
      y: pos.y + labelOffset.y + 16,
    }, node.stateLabel);
  }
}

function renderTeamPulse(items) {
  elements.teamPulseItems.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "pulse-item";

    const node = document.createElement("b");
    node.textContent = item.nodeId;

    const task = document.createElement("span");
    task.textContent = item.task;

    const icon = document.createElement("span");
    icon.className = `pulse-icon ${item.status}`;
    icon.innerHTML = pulseIcon(item.status);

    row.append(node, task, icon);
    return row;
  }));
}

function pulseIcon(status) {
  if (status === "warn") {
    return '<svg><use href="#icon-alert"></use></svg>';
  }
  if (status === "move") {
    return '<svg><use href="#icon-chevrons"></use></svg>';
  }
  if (status === "good") {
    return '<svg><use href="#icon-check"></use></svg>';
  }
  return "";
}

function renderEvidence(metrics) {
  elements.evidenceMetrics.replaceChildren(...metrics.map((metric) => {
    const card = document.createElement("div");
    card.className = `evidence-metric metric-${metric.kind}`;
    card.title = metric.summary ?? metric.label;

    const top = document.createElement("div");
    top.className = "metric-top";
    top.innerHTML = `${metricIcon(metric.kind)}<span class="metric-title"></span><span class="metric-value"></span>`;
    top.querySelector(".metric-title").textContent = metric.label;
    top.querySelector(".metric-value").textContent = metric.kind === "agreement" ? "" : `${metric.value}%`;

    if (metric.kind === "agreement") {
      const value = top.querySelector(".metric-value");
      value.innerHTML = '<svg class="pulse-icon good"><use href="#icon-check"></use></svg>';
    }

    const bar = document.createElement("div");
    bar.className = "metric-bar";
    bar.style.setProperty("--value", `${metric.value}%`);
    bar.append(document.createElement("span"));

    card.append(top, bar);
    return card;
  }));
}

function renderSensorStack(metrics) {
  elements.sensorStack.replaceChildren(...metrics.map((metric, index) => {
    const row = document.createElement("div");
    row.className = `sensor-bar metric-${metric.kind}`;
    row.style.setProperty("--value", `${metric.value}%`);
    row.style.setProperty("--delay", `${index * 65}ms`);

    const label = document.createElement("span");
    label.textContent = metric.label;

    const track = document.createElement("i");
    track.append(document.createElement("b"));

    const value = document.createElement("strong");
    value.textContent = metric.kind === "agreement" ? "quorum" : `${metric.value}%`;

    row.append(label, track, value);
    return row;
  }));
}

function renderCueChain(state, confidenceScore) {
  const policy = state.fusion.policyGate;
  const chain = [
    { label: "Detect", state: confidenceScore >= 20 ? "complete" : "pending" },
    { label: "Correlate", state: confidenceScore >= 45 ? "complete" : "pending" },
    { label: "Review gate", state: policy === "blocked" ? "blocked" : confidenceScore >= 45 ? "active" : "pending" },
    { label: "Task nodes", state: state.coordinator.recommendedNextAction ? "active" : "pending" },
  ];

  elements.cueChain.replaceChildren(...chain.map((item, index) => {
    const step = document.createElement("span");
    step.className = `cue-step ${item.state}`;
    step.style.setProperty("--delay", `${index * 90}ms`);
    step.textContent = item.label;
    return step;
  }));
}

function metricIcon(kind) {
  if (kind === "rf") {
    return '<svg><use href="#icon-radio"></use></svg>';
  }
  if (kind === "audio") {
    return '<svg><use href="#icon-audio"></use></svg>';
  }
  if (kind === "agreement") {
    return '<svg><use href="#icon-team"></use></svg>';
  }
  return '<svg><use href="#icon-eye"></use></svg>';
}

function renderFeed(container, items) {
  container.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "feed-item";

    const dot = document.createElement("span");
    dot.className = `feed-dot ${item.level ?? ""}`;

    const text = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = item.title;
    text.append(title, document.createTextNode(` - ${item.text}`));
    row.append(dot, text);
    return row;
  }));
}

function setSourceStatus(source, error) {
  const className = error ? "is-error" : source.includes("live") ? "is-live" : "is-demo";
  elements.sourceStatus.className = `source-status ${className}`;
  elements.sourceStatus.querySelector("span:last-child").textContent = error ? "Demo fallback" : source;
  elements.sourceStatus.title = error instanceof Error ? error.message : `Current data source: ${source}`;
}

function append(tagName, parent, attrs = {}, text = "") {
  const node = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  if (text !== "") {
    node.textContent = text;
  }
  parent.appendChild(node);
  return node;
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function point(percentPoint, dimensions = { width: MAP_WIDTH, height: MAP_HEIGHT }) {
  return {
    x: (percentPoint.x / 100) * dimensions.width,
    y: (percentPoint.y / 100) * dimensions.height,
  };
}

function mapPoint(value, geoContext, dimensions = { width: MAP_WIDTH, height: MAP_HEIGHT }) {
  const coordinate = coordinateFromValue(value);
  if (coordinate) {
    return geoToMapPoint(coordinate, geoContext, dimensions);
  }
  return point(value, dimensions);
}

function coordinateFromValue(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const direct = latLonFromObject(value);
  if (direct) {
    return direct;
  }
  if (value.type === "Feature") {
    return coordinateFromValue(value.geometry);
  }
  if (value.type === "Point" && Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates;
    return isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null;
  }
  if (isPlainObject(value.geometry)) {
    return coordinateFromValue(value.geometry);
  }
  if (isPlainObject(value.coordinates)) {
    return latLonFromObject(value.coordinates);
  }
  return null;
}

function geoToMapPoint(coordinate, geoContext, dimensions = { width: MAP_WIDTH, height: MAP_HEIGHT }) {
  const zoom = Math.max(1, Math.min(19, Math.round(geoContext.zoom ?? 15)));
  const center = geoToWorldPixel(geoContext.center, zoom);
  const world = geoToWorldPixel(coordinate, zoom);
  return {
    x: dimensions.width / 2 + (world.x - center.x),
    y: dimensions.height / 2 + (world.y - center.y),
  };
}

function metersToMapPixels(meters, geoContext) {
  const zoom = Math.max(1, Math.min(19, Math.round(geoContext.zoom ?? 15)));
  const metersPerPixel = (Math.cos((geoContext.center.latitude * Math.PI) / 180) * 40_075_016.686) / (TILE_SIZE * 2 ** zoom);
  return meters / metersPerPixel;
}

function polygonCenter(points, dimensions = { width: MAP_WIDTH, height: MAP_HEIGHT }) {
  if (!points.length) {
    return { x: dimensions.width / 2, y: dimensions.height / 2 };
  }
  return {
    x: points.reduce((total, item) => total + item.x, 0) / points.length,
    y: points.reduce((total, item) => total + item.y, 0) / points.length,
  };
}

function polylinePath(points) {
  if (!points.length) {
    return "";
  }
  return points.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function mergeDeep(base, update) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(update)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function confidenceLabel(score) {
  if (score >= 0.8) {
    return "High";
  }
  if (score >= 0.45) {
    return "Medium";
  }
  return "Low";
}

function confidenceClass(label) {
  if (label === "High") {
    return "metric-good";
  }
  if (label === "Low") {
    return "metric-bad";
  }
  return "metric-warning";
}

function policyClass(policyGate) {
  if (policyGate === "authorized_to_share") {
    return "authorized";
  }
  if (policyGate === "blocked") {
    return "blocked";
  }
  return "";
}

function computeReadinessScore(state) {
  const confidence = percent(state.fusion.confidenceScore ?? 0);
  const activeNodes = state.gossip.nodes.filter((node) => node.status !== "degraded").length;
  const nodeScore = state.gossip.nodes.length > 0 ? Math.round((activeNodes / state.gossip.nodes.length) * 100) : 0;
  const evidenceScore = Math.round(average(state.fusion.evidence.map((metric) => metric.value ?? 0)));
  return Math.round(confidence * 0.38 + nodeScore * 0.34 + evidenceScore * 0.28);
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function bearingFromPosition(position, geoContext) {
  if (!position) {
    return "--";
  }
  const coordinate = coordinateFromValue(position);
  if (coordinate && geoContext?.center) {
    return bearingFromCoordinate(geoContext.center, coordinate);
  }
  const dx = position.x - 50;
  const dy = 50 - position.y;
  const degrees = Math.round((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return `${cardinalFromDegrees(degrees)} / ${String(degrees).padStart(3, "0")} deg`;
}

function bearingFromCoordinate(from, to) {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const degrees = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  return `${cardinalFromDegrees(degrees)} / ${String(degrees).padStart(3, "0")} deg`;
}

function cardinalFromDegrees(degrees) {
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return cardinals[Math.round(degrees / 45) % cardinals.length];
}

function formatLatLon(coordinate) {
  if (!coordinate) {
    return "--";
  }
  const latCardinal = coordinate.latitude >= 0 ? "N" : "S";
  const lonCardinal = coordinate.longitude >= 0 ? "E" : "W";
  return `${Math.abs(coordinate.latitude).toFixed(5)}${latCardinal}, ${Math.abs(coordinate.longitude).toFixed(5)}${lonCardinal}`;
}

function gridFromPosition(position) {
  if (!position) {
    return "--";
  }
  const x = Math.round(position.x * 10).toString().padStart(4, "0");
  const y = Math.round(position.y * 10).toString().padStart(4, "0");
  return `NW07 ${x} ${y}`;
}

function numberValue(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function callsignFromLabel(label) {
  return `HK-${String(label).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 12).toUpperCase() || "FUSED"}-01`;
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function capitalize(value) {
  const text = String(value ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPolicy(policyGate) {
  return formatToken(policyGate ?? "review_needed");
}

function formatToken(value) {
  return String(value).replaceAll("_", " ");
}

function formatDroneClass(value) {
  const formatted = formatToken(value ?? "unknown");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function shortNodeId(nodeId) {
  const known = {
    "altiair-hub": "N1",
    "altiair-orin": "N2",
    "altiair-node-a": "N3",
    "altiair-node-b": "N5",
  };
  if (known[nodeId]) {
    return known[nodeId];
  }
  const match = String(nodeId).match(/(\d+)$/);
  return match ? `N${match[1]}` : String(nodeId).replace(/^altiair-/, "");
}

function nodeLabel(nodeId) {
  const known = {
    "altiair-hub": "Node 1",
    "altiair-orin": "Node 2",
    "altiair-node-a": "Node 3",
    "altiair-node-b": "Node 5",
  };
  return known[nodeId] ?? shortNodeId(nodeId).replace(/^N/, "Node ");
}
