const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createElement(id) {
  const listeners = new Map();

  return {
    id,
    disabled: false,
    innerHTML: "",
    textContent: "",
    value: "",
    addEventListener(event, handler) {
      listeners.set(event, handler);
    },
    dispatchEvent(event) {
      const handler = listeners.get(event.type);
      if (handler) {
        return handler(event);
      }

      return undefined;
    }
  };
}

function readPublicFile(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", "public", fileName), "utf8");
}

function getAppDomIds() {
  const appSource = readPublicFile("app.js");
  return Array.from(appSource.matchAll(/document\.querySelector\("#([^"]+)"\)/g), (match) => match[1]);
}

function getIndexDomIds() {
  const indexSource = readPublicFile("index.html");
  return new Set(Array.from(indexSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
}

function createBrowserHarness({ labsPayload, modesPayloadByLab, runPayloadByLabMode }) {
  const elementIds = getAppDomIds();
  const elements = Object.fromEntries(elementIds.map((id) => [id, createElement(id)]));
  const fetchCalls = [];

  const context = vm.createContext({
    document: {
      querySelector(selector) {
        return elements[selector.slice(1)];
      }
    },
    fetch: async (url) => {
      fetchCalls.push(url);

      if (url === "/api/labs") {
        return { ok: true, json: async () => labsPayload };
      }

      const modesMatch = url.match(/^\/api\/labs\/([^/]+)\/modes$/);
      if (modesMatch) {
        return { ok: true, json: async () => modesPayloadByLab[modesMatch[1]] };
      }

      const runMatch = url.match(/^\/api\/labs\/([^/]+)\/run\?mode=([^&]+)$/);
      if (runMatch) {
        return { ok: true, json: async () => runPayloadByLabMode[`${runMatch[1]}:${decodeURIComponent(runMatch[2])}`] };
      }

      return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
    }
  });

  const appPath = path.join(__dirname, "..", "public", "app.js");
  vm.runInContext(readPublicFile("app.js"), context, { filename: appPath });

  return { elements, fetchCalls };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

// This deterministic VM harness executes the real browser app without a full browser.
// Keep these assertions focused on user-visible copy and flow outcomes, not DOM internals.
function stripMarkup(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleTextFrom(elements, ids) {
  return ids
    .map((id) => `${elements[id].textContent} ${stripMarkup(elements[id].innerHTML)}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicIndexVisibleText() {
  return stripMarkup(readPublicFile("index.html"));
}

function assertVisibleTextIncludes(visibleText, expected) {
  assert.ok(
    visibleText.includes(expected),
    `Expected visible UI text to include ${JSON.stringify(expected)}. Visible text: ${visibleText}`
  );
}

function assertVisibleTextExcludes(visibleText, unexpected) {
  assert.ok(
    !visibleText.includes(unexpected),
    `Expected visible UI text not to include ${JSON.stringify(unexpected)}. Visible text: ${visibleText}`
  );
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }

  assert.fail("Timed out waiting for browser flow condition");
}

test("public index exposes every DOM id used by the browser app", () => {
  const missingIds = getAppDomIds().filter((id) => !getIndexDomIds().has(id));

  assert.deepEqual(missingIds, []);
});

test("public index marks Session 29 as the current lab", () => {
  const indexVisibleText = publicIndexVisibleText();

  assertVisibleTextIncludes(indexVisibleText, "Sesión 26 · Implementada: locks, leases y vencimiento");
  assertVisibleTextIncludes(indexVisibleText, "Sesión 27 · Implementada: elección de líder y detectores de fallas");
  assertVisibleTextIncludes(indexVisibleText, "Sesión 28 · Implementada: coordinación distribuida en escenarios reales");
  assertVisibleTextIncludes(indexVisibleText, "Sesión 29 · Actual: laboratorio integrador para PC3");
  assertVisibleTextExcludes(indexVisibleText, "Sesión 26 · Actual");
  assertVisibleTextExcludes(indexVisibleText, "Sesión 27 · Actual");
  assertVisibleTextExcludes(indexVisibleText, "Sesión 28 · Actual");
});

test("browser VM harness auto-runs active Session 29 and shows the user-facing PC3 defense", async () => {
  const runPayload = {
    labId: "coordination-integration",
    session: 29,
    mode: "pc3-ready-happy-path",
    title: "Sesión 29: Laboratorio integrador de sincronización y coordinación",
    summary: "La acción se acepta porque todas las señales integradas son consistentes.",
    observations: ["Todas las señales educativas apuntan en la misma dirección."],
    recommendations: ["Cruce tiempo físico, sincronización, Lamport, vector clocks, lease, líder y sospecha."],
    decisions: [
      {
        title: "Defensa con evidencia combinada",
        decision: "accepted",
        recommendation: "No defienda una acción distribuida con una sola señal."
      }
    ],
    learning: {
      objective: "Defender una decisión distribuida de AURA integrando evidencia de tiempo físico, sincronización, Lamport, vector clocks, leases, líder, sospecha de fallas y compensación.",
      keyMetrics: [
        { label: "Lease valid", value: true, unit: "boolean", meaning: "Comprueba si la acción ocurre dentro del ownership temporal." }
      ],
      checklist: ["Valide tolerancia", "Revise vector clocks"],
      takeaway: "La defensa PC3 exige una decisión limitada y honesta."
    },
    metrics: { actionAccepted: true, leaseValid: true, vectorConflictDetected: false },
    evidence: {
      integrationId: "aura-pc3-coordination-defense",
      decision: "accepted",
      confidence: "high",
      physicalTime: { maxSkewMs: 18 },
      clockSync: { trusted: true },
      lamport: { insufficiency: false },
      vectorClock: { concurrent: false, conflictDetected: false },
      lease: { validAtAction: true },
      leader: { stable: true },
      failureSuspicion: { suspected: false },
      compensation: { applied: false },
      boundary: "Session 29 integrates synchronization and coordination reasoning for PC3 defense only; it does not implement consensus, quorum, Raft/Paxos, production membership, distributed transactions, or real failover."
    },
    timeline: [{ label: "gestor-flota acepta despacho", decision: "accepted" }],
    raw: {
      mode: "pc3-ready-happy-path"
    }
  };
  const { elements, fetchCalls } = createBrowserHarness({
    labsPayload: {
        labs: [
          { id: "physical-time", session: 21, title: "Tiempo físico", purpose: "Fundamento de tiempo físico", relationship: "Fundamento para la Sesión 22", defaultMode: "normal" },
          { id: "clock-sync", session: 22, title: "Sincronización de relojes", purpose: "Sincronización de relojes", relationship: "Continúa la Sesión 21", defaultMode: "scenario-analysis" },
          { id: "lamport-ordering", session: 23, title: "Lamport clocks", purpose: "Orden parcial", relationship: "Prepara Sesión 24", defaultMode: "causal-chain" },
          { id: "vector-clocks", session: 24, title: "Vector clocks", purpose: "Causalidad precisa", relationship: "Prepara Sesión 25", defaultMode: "causal-chain" },
          { id: "mutual-exclusion", session: 25, title: "Exclusión mutua", purpose: "Sección crítica", relationship: "Prepara Sesión 26", defaultMode: "contended-queue" },
          { id: "distributed-locks", session: 26, title: "Locks distribuidos", purpose: "Leases", relationship: "Prepara Sesión 27", defaultMode: "lock-acquire-and-hold" },
          { id: "leader-election", session: 27, title: "Elección de líder", purpose: "Detectores de fallas", relationship: "Prepara Sesión 28", defaultMode: "stable-leader-heartbeats" },
          { id: "distributed-coordination", session: 28, title: "Coordinación distribuida", purpose: "Decisiones coordinadas", relationship: "Prepara Sesión 29", defaultMode: "coordinated-dispatch-handoff" },
          { id: "coordination-integration", session: 29, title: "Laboratorio integrador", purpose: "Defensa PC3", relationship: "Integra las Sesiones 21-28", defaultMode: "pc3-ready-happy-path" }
        ]
      },
      modesPayloadByLab: {
      "coordination-integration": {
        modes: [
          { id: "pc3-ready-happy-path", title: "Preparado para PC3" },
          { id: "causal-conflict-review", title: "Conflicto causal" }
        ]
      }
    },
    runPayloadByLabMode: { "coordination-integration:pc3-ready-happy-path": runPayload }
  });

  await waitFor(() => visibleTextFrom(elements, ["status"]).includes("Modo pc3-ready-happy-path cargado."));

  const visibleModeOptions = visibleTextFrom(elements, ["mode-select"]);
  assertVisibleTextIncludes(visibleModeOptions, "Preparado para PC3");
  assertVisibleTextIncludes(visibleModeOptions, "Conflicto causal");
  assert.equal(elements["mode-select"].value, "pc3-ready-happy-path");
  assert.equal(elements["run-mode"].disabled, false);

  assert.deepEqual(fetchCalls, [
    "/api/labs",
    "/api/labs/coordination-integration/modes",
    "/api/labs/coordination-integration/run?mode=pc3-ready-happy-path"
  ]);

  const visibleCurrentLabText = visibleTextFrom(elements, [
    "lab-session",
    "lab-title",
    "lab-purpose",
    "lab-relationship",
    "mode-select",
    "summary-content",
    "observations-content",
    "learning-content",
    "metrics-content",
    "timeline-content",
    "status"
  ]);
  assertVisibleTextIncludes(visibleCurrentLabText, "Sesión 29");
  assertVisibleTextIncludes(visibleCurrentLabText, "Laboratorio integrador");
  assertVisibleTextIncludes(visibleCurrentLabText, "Defensa PC3");
  assertVisibleTextIncludes(visibleCurrentLabText, "Integra las Sesiones 21-28");
  assertVisibleTextIncludes(visibleCurrentLabText, "Preparado para PC3");
  assertVisibleTextIncludes(visibleCurrentLabText, "coordination-integration");
  assertVisibleTextIncludes(visibleCurrentLabText, "pc3-ready-happy-path");
  assertVisibleTextIncludes(visibleCurrentLabText, "Modo pc3-ready-happy-path cargado.");
  assertVisibleTextIncludes(visibleCurrentLabText, "La acción se acepta porque todas las señales integradas son consistentes.");
  assertVisibleTextIncludes(visibleCurrentLabText, "Defender una decisión distribuida");
  assertVisibleTextIncludes(visibleCurrentLabText, "Integración de sincronización y coordinación");
  assertVisibleTextIncludes(visibleCurrentLabText, "aura-pc3-coordination-defense");
  assertVisibleTextIncludes(visibleCurrentLabText, "Decisión accepted");
  assertVisibleTextIncludes(visibleCurrentLabText, "Confianza high");
  assertVisibleTextIncludes(visibleCurrentLabText, "Lease vigente Sí");
  assertVisibleTextIncludes(visibleCurrentLabText, "Líder estable Sí");
  assertVisibleTextIncludes(visibleCurrentLabText, "Compensación No aplicada");
  assertVisibleTextIncludes(visibleCurrentLabText, "does not implement consensus, quorum, Raft/Paxos");
  assertVisibleTextIncludes(visibleCurrentLabText, "Defensa con evidencia combinada");
  assertVisibleTextIncludes(visibleCurrentLabText, "No defienda una acción distribuida con una sola señal.");
  assertVisibleTextIncludes(visibleCurrentLabText, "gestor-flota acepta despacho");
  assertVisibleTextIncludes(visibleCurrentLabText, "decisión=accepted");
  assertVisibleTextExcludes(visibleCurrentLabText, "Sesión 28 · Actual");
  assertVisibleTextExcludes(visibleCurrentLabText, "coordinated-dispatch-handoff");

  const visibleRawJsonText = visibleTextFrom(elements, ["raw-json"]);
  assertVisibleTextIncludes(visibleRawJsonText, '"mode": "pc3-ready-happy-path"');
  assertVisibleTextIncludes(visibleRawJsonText, '"actionAccepted": true');
});

test("browser flow ignores stale delayed modes responses after switching labs", async () => {
  const delayedClockModes = createDeferred();
  const physicalPayload = {
    labId: "physical-time",
    session: 21,
    mode: "normal",
    title: "Sesión 21: tiempo físico",
    summary: "Evidencia actual de tiempo físico.",
    observations: ["Los timestamps físicos requieren tolerancia explícita."],
    recommendations: ["Valide skew antes de aceptar eventos."],
    decisions: [],
    learning: {
      objective: "Distinguir wall-clock de monotonic time.",
      keyMetrics: [{ label: "Duración monotonic", value: 120, unit: "ms", meaning: "Duración estable." }],
      checklist: ["Compare duraciones", "Revise skew"],
      takeaway: "Use monotonic time para duraciones."
    },
    metrics: { monotonicDurationMs: 120 },
    timeline: [{ label: "Evento aceptado", decision: "aceptado" }],
    raw: { mode: "normal" }
  };
  const { elements, fetchCalls } = createBrowserHarness({
    labsPayload: {
      labs: [
        { id: "physical-time", session: 21, title: "Tiempo físico", purpose: "Fundamento de tiempo físico", relationship: "Fundamento para la Sesión 22", defaultMode: "normal" },
        { id: "clock-sync", session: 22, title: "Sincronización de relojes", purpose: "Sincronización de relojes", relationship: "Continúa la Sesión 21", defaultMode: "scenario-analysis" },
        { id: "lamport-ordering", session: 23, title: "Lamport clocks", purpose: "Orden parcial", relationship: "Prepara Sesión 24", defaultMode: "causal-chain" }
      ]
    },
    modesPayloadByLab: {
      "lamport-ordering": delayedClockModes.promise,
      "physical-time": {
        modes: [
          { id: "normal", title: "Relojes físicos base" },
          { id: "drift", title: "Crecimiento de drift" }
        ]
      }
    },
    runPayloadByLabMode: { "physical-time:normal": physicalPayload }
  });

  await waitFor(() => elements["lab-select"].value === "lamport-ordering");
  elements["lab-select"].value = "physical-time";
  const physicalChange = elements["lab-select"].dispatchEvent({ type: "change" });

  await waitFor(() => elements["raw-json"].textContent.includes('"labId": "physical-time"'));
  await physicalChange;

  delayedClockModes.resolve({
    modes: [
      { id: "scenario-analysis", title: "Análisis de escenarios" },
      { id: "normal", title: "Intercambio NTP simétrico" }
    ]
  });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(elements["lab-select"].value, "physical-time");
  assert.equal(elements["mode-select"].value, "normal");
  assert.match(elements["mode-select"].innerHTML, /drift/);
  assert.doesNotMatch(elements["mode-select"].innerHTML, /scenario-analysis/);
  assert.match(elements["summary-content"].innerHTML, /physical-time/);
  assert.match(elements["summary-content"].innerHTML, /normal/);
  assert.match(elements["raw-json"].textContent, /"labId": "physical-time"/);
  assert.match(elements["raw-json"].textContent, /"mode": "normal"/);
  assert.doesNotMatch(elements["raw-json"].textContent, /clock-sync|scenario-analysis/);
  assert.deepEqual(fetchCalls, [
    "/api/labs",
    "/api/labs/lamport-ordering/modes",
    "/api/labs/physical-time/modes",
    "/api/labs/physical-time/run?mode=normal"
  ]);
});

test("browser flow selects Session 21 physical time and runs drift mode", async () => {
  const defaultLamportPayload = {
    labId: "lamport-ordering",
    session: 23,
    mode: "causal-chain",
    title: "Sesión 23: Lamport clocks",
    summary: "Evidencia predeterminada de Lamport.",
    observations: ["Evidencia predeterminada de lamport-ordering."],
    recommendations: [],
    decisions: [],
    learning: {
      objective: "Objetivo predeterminado.",
      keyMetrics: [{ label: "Edges causales", value: 4, unit: "edges", meaning: "Relaciones causales predeterminadas." }],
      checklist: ["Compare ventanas", "Mantenga una política conservadora"],
      takeaway: "Conclusión predeterminada."
    },
    metrics: { causalEdges: 4 },
    timeline: [],
    raw: { mode: "causal-chain" }
  };
  const normalPayload = {
    labId: "physical-time",
    session: 21,
    mode: "normal",
    title: "Sesión 21: tiempo físico",
    summary: "Evidencia base de relojes físicos",
    observations: ["Monotonic time es más seguro para medir duración."],
    recommendations: ["Use ventanas de tolerancia."],
    decisions: [{ title: "Duración", decision: "usar monotonic time", recommendation: "No use wall-clock para tiempo transcurrido." }],
    learning: {
      objective: "Distinguir fuentes de reloj.",
      keyMetrics: [{ label: "Duración monotonic time", value: 120, unit: "ms", meaning: "Tiempo transcurrido." }],
      checklist: ["Compare duraciones", "Valide skew"],
      takeaway: "Wall-clock funciona como metadatos."
    },
    metrics: { monotonicDurationMs: 120 },
    timeline: [],
    raw: { mode: "normal" }
  };
  const driftPayload = {
    labId: "physical-time",
    session: 21,
    mode: "drift",
    title: "Sesión 21: tiempo físico",
    summary: "Un nodo adelanta su reloj en cada tick",
    observations: ["El skew de reloj crece entre puntos de sincronización."],
    recommendations: ["Refresque la sincronización antes de agotar el presupuesto de tolerancia."],
    decisions: [],
    learning: {
      objective: "Observar el crecimiento de drift.",
      keyMetrics: [{ label: "Skew final", value: 65, unit: "ms", meaning: "Skew al final de la línea de tiempo." }],
      checklist: ["Siga cada tick", "Decida cuándo resincronizar"],
      takeaway: "El drift convierte datos de sincronización antiguos en incertidumbre creciente."
    },
    metrics: { finalClockSkewMs: 65 },
    timeline: [{ label: "Tick 6", decision: "skew=65ms" }],
    raw: { mode: "drift", finalClockSkewMs: 65 }
  };
  const { elements, fetchCalls } = createBrowserHarness({
    labsPayload: {
      labs: [
        { id: "physical-time", session: 21, title: "Tiempo físico", purpose: "Fundamento de tiempo físico", relationship: "Fundamento para la Sesión 22", defaultMode: "normal" },
        { id: "clock-sync", session: 22, title: "Sincronización de relojes", purpose: "Sincronización de relojes", relationship: "Continúa la Sesión 21", defaultMode: "scenario-analysis" },
        { id: "lamport-ordering", session: 23, title: "Lamport clocks", purpose: "Orden parcial", relationship: "Prepara Sesión 24", defaultMode: "causal-chain" }
      ]
    },
    modesPayloadByLab: {
      "physical-time": {
        modes: [
          { id: "normal", title: "Baseline physical clocks" },
          { id: "drift", title: "Clock drift growth" }
        ]
      },
      "clock-sync": {
        modes: [{ id: "scenario-analysis", title: "Scenario analysis" }]
      },
      "lamport-ordering": {
        modes: [{ id: "causal-chain", title: "Causal chain" }]
      }
    },
    runPayloadByLabMode: {
      "lamport-ordering:causal-chain": defaultLamportPayload,
      "physical-time:normal": normalPayload,
      "physical-time:drift": driftPayload
    }
  });

  await waitFor(() => elements["mode-select"].innerHTML.includes("causal-chain"));
  await waitFor(() => elements["raw-json"].textContent.includes('"mode": "causal-chain"'));

  elements["lab-select"].value = "physical-time";
  await elements["lab-select"].dispatchEvent({ type: "change" });
  await waitFor(() => elements["mode-select"].innerHTML.includes("drift"));
  await waitFor(() => elements["raw-json"].textContent.includes('"mode": "normal"'));
  assert.doesNotMatch(elements["summary-content"].innerHTML, /clock-sync/);
  elements["mode-select"].value = "drift";
  await elements["mode-select"].dispatchEvent({ type: "change" });
  assert.doesNotMatch(elements["summary-content"].innerHTML, /normal|scenario-analysis|clock-sync/);
  assert.equal(elements["raw-json"].textContent, "{}");
  await elements["run-mode"].dispatchEvent({ type: "click" });

  assert.deepEqual(fetchCalls, [
    "/api/labs",
    "/api/labs/lamport-ordering/modes",
    "/api/labs/lamport-ordering/run?mode=causal-chain",
    "/api/labs/physical-time/modes",
    "/api/labs/physical-time/run?mode=normal",
    "/api/labs/physical-time/run?mode=drift"
  ]);
  assert.match(elements["lab-session"].textContent, /21/);
  assert.match(elements["lab-relationship"].textContent, /Fundamento/);
  assert.match(elements["summary-content"].innerHTML, /physical-time/);
  assert.match(elements["summary-content"].innerHTML, /drift/);
  assert.match(elements["learning-content"].innerHTML, /Observar el crecimiento de drift/);
  assert.match(elements["raw-json"].textContent, /"mode": "drift"/);
  assert.match(elements["status"].textContent, /drift/);
});
