const SVG_NS = "http://www.w3.org/2000/svg";
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 390;
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
    latestEvent: "Possible aerial object NW",
    eventLabel: "Fused Detection",
    position: { x: 39.3, y: 15.2 },
    trackTrail: [
      { x: 39.7, y: 15.8 },
      { x: 42.5, y: 20.5 },
      { x: 46.8, y: 24.4 },
      { x: 52.4, y: 28.2 },
      { x: 59.7, y: 32.1 },
      { x: 66.6, y: 33.6 },
    ],
    rfBearings: [
      [
        { x: 39.8, y: 16.6 },
        { x: 49.8, y: 40.5 },
        { x: 72.2, y: 65.8 },
      ],
    ],
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
      { id: "N1", label: "Node 1", x: 49.6, y: 48.8, status: "active", labelOffset: { x: -18, y: 30 } },
      {
        id: "N2",
        label: "Node 2",
        x: 71.7,
        y: 66.3,
        status: "active",
        labelOffset: { x: 20, y: 0 },
        fov: [
          { x: 72.2, y: 67.2 },
          { x: 78.5, y: 74.0 },
          { x: 73.8, y: 87.0 },
        ],
      },
      {
        id: "N3",
        label: "Node 3",
        x: 33.1,
        y: 74.6,
        status: "active",
        labelOffset: { x: -65, y: 8 },
        fov: [
          { x: 32.9, y: 75.4 },
          { x: 28.8, y: 86.8 },
          { x: 33.4, y: 93.4 },
        ],
      },
      {
        id: "N4",
        label: "Node 4",
        x: 28.0,
        y: 20.5,
        status: "active",
        labelOffset: { x: -56, y: -4 },
        fov: [
          { x: 28.6, y: 21.3 },
          { x: 33.2, y: 29.5 },
          { x: 30.0, y: 37.2 },
        ],
      },
      {
        id: "N5",
        label: "Node 5",
        x: 23.6,
        y: 51.8,
        status: "active",
        labelOffset: { x: -54, y: -3 },
        fov: [
          { x: 23.3, y: 52.6 },
          { x: 18.9, y: 60.0 },
          { x: 22.2, y: 67.2 },
        ],
      },
      { id: "N6", label: "Node 6", x: 74.9, y: 29.8, status: "degraded", stateLabel: "Degraded", labelOffset: { x: 18, y: 0 } },
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
    objectiveArea: [
      { x: 45.4, y: 73.7 },
      { x: 43.2, y: 70.0 },
      { x: 42.9, y: 64.2 },
      { x: 44.3, y: 58.4 },
      { x: 47.2, y: 54.6 },
      { x: 49.0, y: 51.0 },
      { x: 52.2, y: 53.0 },
      { x: 54.4, y: 52.2 },
      { x: 55.4, y: 56.4 },
      { x: 57.4, y: 58.0 },
      { x: 57.0, y: 63.4 },
      { x: 55.1, y: 66.8 },
      { x: 55.0, y: 72.0 },
      { x: 52.6, y: 78.4 },
      { x: 49.7, y: 82.0 },
      { x: 46.6, y: 81.0 },
      { x: 44.4, y: 78.0 },
    ],
  },
};

const elements = {
  sourceStatus: document.querySelector("#sourceStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  pauseButton: document.querySelector("#pauseButton"),
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
};

const app = {
  paused: false,
  timer: null,
  lastSource: "demo",
};

elements.refreshButton.addEventListener("click", () => {
  void refreshDashboard();
});

elements.pauseButton.addEventListener("click", () => {
  app.paused = !app.paused;
  elements.pauseButton.title = app.paused ? "Resume polling" : "Pause polling";
  elements.pauseButton.setAttribute("aria-label", elements.pauseButton.title);
  elements.pauseButton.innerHTML = `<svg><use href="#${app.paused ? "icon-play" : "icon-pause"}"></use></svg>`;
  if (!app.paused) {
    scheduleRefresh();
  }
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
    fetchJson(joinUrl(apiBase, "congestion")),
    fetchJson(joinUrl(apiBase, "bundles/pending")),
    fetchJson(joinUrl(apiBase, "ledger")),
  ]);

  const [health, topology, peers, gateway, congestion, pending, ledger] = endpoints.map((result) =>
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
    return mergeDeep(fallbackState, payload);
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

  base.updatedAt = snapshot.capturedAt ?? new Date().toISOString();
  base.mission.status = `${onlineCount}/${totalCount} nodes active - ${onlineCount >= 3 ? "mesh stable" : "mesh degraded"}`;
  base.fusion.confidenceScore = latestCue?.confidence ?? latestEstimate?.confidence ?? base.fusion.confidenceScore;
  base.fusion.confidenceLabel = confidenceLabel(base.fusion.confidenceScore);
  base.fusion.latestEvent = latestDrone
    ? `${formatDroneClass(latestDrone.droneClass)} cue in ${latestDrone.zoneId ?? "active zone"}`
    : pendingBundles.length > 0
      ? `${pendingBundles.length} pending evidence bundle${pendingBundles.length === 1 ? "" : "s"}`
      : "No active fused event";
  base.fusion.policyGate = latestCue?.policyGate ?? latestBundle?.counterUasCues?.[0]?.policyGate ?? "review_needed";
  base.fusion.evidence = evidenceFromBundle(latestBundle, base.fusion.evidence);
  base.fusion.feed = [
    {
      level: latestCue ? "warn" : "info",
      title: "Fusion",
      text: latestCue?.evidence?.[0]?.summary ?? "Waiting for fused cue bundle from the local LLM fusion layer.",
    },
    {
      level: base.fusion.policyGate === "authorized_to_share" ? "good" : "warn",
      title: "Policy",
      text: `Current policy gate is ${formatPolicy(base.fusion.policyGate)}.`,
    },
    {
      level: congestion?.acceptBundle === false ? "bad" : "good",
      title: "Backpressure",
      text: congestion?.preferredDecision
        ? `Gateway recommends ${formatToken(congestion.preferredDecision)}.`
        : "No congestion decision received.",
    },
  ];

  base.coordinator.recommendedNextAction =
    latestCue?.recommendedNextChecks?.[0] ??
    (congestion?.preferredDecision ? `Coordinator fallback: ${formatToken(congestion.preferredDecision)}` : base.coordinator.recommendedNextAction);
  base.coordinator.operatorNextAction =
    latestCue?.recommendedNextChecks?.[0] ??
    "Maintain observation. Keep collecting compact evidence until a cue is available.";
  base.coordinator.teamPulse = liveNodes.map((node) => ({
    nodeId: node.id,
    task: node.status === "degraded" ? "Degraded" : selectedGateway === node.sourceId ? "Gateway" : node.id === shortNodeId(health.nodeId) ? "Local" : "Peer",
    status: node.status === "degraded" ? "warn" : selectedGateway === node.sourceId ? "good" : "neutral",
  }));
  base.coordinator.feed = [
    {
      level: "info",
      title: "Coordinator",
      text: base.coordinator.recommendedNextAction,
    },
    {
      level: selectedGateway ? "good" : "warn",
      title: "Gateway",
      text: selectedGateway ? `${nodeLabel(selectedGateway)} selected for sync.` : "No gateway selected; continue local queueing.",
    },
    {
      level: pendingBundles.length > 0 ? "warn" : "good",
      title: "Queue",
      text: `${pendingBundles.length} bundle${pendingBundles.length === 1 ? "" : "s"} pending local handling.`,
    },
  ];

  base.gossip.feed = [
    {
      level: onlineCount >= 3 ? "good" : "warn",
      title: "Mesh",
      text: `${onlineCount} of ${totalCount} nodes reachable through gossip and heartbeat state.`,
    },
    {
      level: selectedGateway ? "good" : "warn",
      title: "Gateway",
      text: selectedGateway ? `${nodeLabel(selectedGateway)} is current gateway candidate.` : "Gateway selection is local-only.",
    },
    {
      level: snapshot.ledger?.survivableNodeLoss ? "good" : "warn",
      title: "Ledger",
      text: snapshot.ledger?.storedRecordCount
        ? `${snapshot.ledger.storedRecordCount} replicated records visible locally.`
        : "No replicated records reported yet.",
    },
  ];

  return base;
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
    "altiair-hub": { x: 49.6, y: 48.8, labelOffset: { x: -18, y: 30 } },
    "altiair-node-a": {
      x: 33.1,
      y: 74.6,
      labelOffset: { x: -65, y: 8 },
      fov: [
        { x: 32.9, y: 75.4 },
        { x: 28.8, y: 86.8 },
        { x: 33.4, y: 93.4 },
      ],
    },
    "altiair-node-b": {
      x: 23.6,
      y: 51.8,
      labelOffset: { x: -54, y: -3 },
      fov: [
        { x: 23.3, y: 52.6 },
        { x: 18.9, y: 60.0 },
        { x: 22.2, y: 67.2 },
      ],
    },
    "altiair-orin": {
      x: 71.7,
      y: 66.3,
      labelOffset: { x: 20, y: 0 },
      fov: [
        { x: 72.2, y: 67.2 },
        { x: 78.5, y: 74.0 },
        { x: 73.8, y: 87.0 },
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

function renderDashboard(state) {
  elements.missionName.textContent = state.mission.name;
  elements.meshStatus.textContent = state.mission.status;
  elements.confidenceLabel.textContent = state.fusion.confidenceLabel;
  elements.confidenceLabel.className = confidenceClass(state.fusion.confidenceLabel);
  elements.latestEvent.textContent = state.fusion.latestEvent;
  elements.recommendedAction.textContent = state.coordinator.recommendedNextAction;
  elements.operatorAction.textContent = state.coordinator.operatorNextAction;
  elements.policyGate.textContent = formatPolicy(state.fusion.policyGate);
  elements.policyGate.className = `policy-pill ${policyClass(state.fusion.policyGate)}`;

  renderMap(state);
  renderTeamPulse(state.coordinator.teamPulse);
  renderEvidence(state.fusion.evidence);
  renderFeed(elements.fusionFeed, state.fusion.feed);
  renderFeed(elements.coordinatorFeed, state.coordinator.feed);
  renderFeed(elements.gossipFeed, state.gossip.feed);
}

function renderMap(state) {
  const svg = elements.mapSvg;
  clearNode(svg);
  appendDefs(svg);
  renderGrid(svg);
  renderTerrain(svg);

  const objective = state.map.objectiveArea.map(point);
  append("polygon", svg, {
    class: "objective-area",
    points: objective.map((p) => `${p.x},${p.y}`).join(" "),
  });
  renderObjectiveHatch(svg, objective);

  append("text", svg, {
    class: "map-objective-label",
    x: point({ x: 47.4, y: 78 }).x,
    y: point({ x: 47.4, y: 78 }).y,
  }, state.map.objectiveAreaLabel);

  const nodeById = new Map(state.gossip.nodes.map((node) => [node.id, node]));
  for (const node of state.gossip.nodes) {
    if (Array.isArray(node.fov)) {
      append("polygon", svg, {
        class: "fov-shape",
        points: node.fov.map(point).map((p) => `${p.x},${p.y}`).join(" "),
      });
    }
  }

  for (const [fromId, toId] of state.gossip.links) {
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) {
      continue;
    }
    append("path", svg, {
      class: "mesh-link-path",
      d: `M ${point(from).x} ${point(from).y} L ${point(to).x} ${point(to).y}`,
    });
  }

  for (const bearing of state.fusion.rfBearings ?? []) {
    append("path", svg, {
      class: "rf-bearing-path",
      d: polylinePath(bearing.map(point)),
    });
  }

  append("path", svg, {
    class: "track-path",
    d: polylinePath((state.fusion.trackTrail ?? []).map(point)),
  });

  renderDetection(svg, state.fusion);

  for (const node of state.gossip.nodes) {
    renderNode(svg, node);
  }
}

function appendDefs(svg) {
  const defs = append("defs", svg);
  const glow = append("filter", defs, { id: "softGlow", x: "-70%", y: "-70%", width: "240%", height: "240%" });
  append("feGaussianBlur", glow, { stdDeviation: "4", result: "blur" });
  const merge = append("feMerge", glow);
  append("feMergeNode", merge, { in: "blur" });
  append("feMergeNode", merge, { in: "SourceGraphic" });
}

function renderGrid(svg) {
  for (let x = 140; x < MAP_WIDTH; x += 140) {
    append("line", svg, {
      class: `map-grid-line ${x % 280 === 0 ? "map-grid-major" : ""}`,
      x1: x,
      y1: 0,
      x2: x,
      y2: MAP_HEIGHT,
    });
  }
  for (let y = 46; y < MAP_HEIGHT; y += 66) {
    append("line", svg, {
      class: `map-grid-line ${y % 132 === 46 ? "map-grid-major" : ""}`,
      x1: 0,
      y1: y,
      x2: MAP_WIDTH,
      y2: y,
    });
  }
}

function renderTerrain(svg) {
  for (let i = 0; i < 28; i += 1) {
    const startY = 16 + i * 14;
    let d = `M 0 ${startY}`;
    for (let x = 0; x <= MAP_WIDTH; x += 60) {
      const y = startY + Math.sin((x + i * 31) / 74) * 10 + Math.cos((x + i * 19) / 39) * 4;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    append("path", svg, { class: "terrain-line", d });
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

function renderDetection(svg, fusion) {
  const center = point(fusion.position);
  for (const radius of [22, 36, 50]) {
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
}

function renderNode(svg, node) {
  const pos = point(node);
  const group = append("g", svg, { class: `node-group ${node.status === "degraded" ? "degraded" : ""}` });
  append("circle", group, { class: "node-outer", cx: pos.x, cy: pos.y, r: 10, filter: "url(#softGlow)" });
  append("circle", group, { class: "node-middle", cx: pos.x, cy: pos.y, r: 6.5 });
  append("circle", group, { class: "node-core", cx: pos.x, cy: pos.y, r: 3.3 });

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

function point(percentPoint) {
  return {
    x: (percentPoint.x / 100) * MAP_WIDTH,
    y: (percentPoint.y / 100) * MAP_HEIGHT,
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
