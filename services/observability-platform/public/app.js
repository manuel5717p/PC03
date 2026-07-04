const statusElement = document.querySelector("#status");
const labSelect = document.querySelector("#lab-select");
const labSession = document.querySelector("#lab-session");
const labTitle = document.querySelector("#lab-title");
const labPurpose = document.querySelector("#lab-purpose");
const labRelationship = document.querySelector("#lab-relationship");
const modeSelect = document.querySelector("#mode-select");
const runButton = document.querySelector("#run-mode");
const summaryContent = document.querySelector("#summary-content");
const observationsContent = document.querySelector("#observations-content");
const learningContent = document.querySelector("#learning-content");
const metricsContent = document.querySelector("#metrics-content");
const timelineContent = document.querySelector("#timeline-content");
const rawJson = document.querySelector("#raw-json");
let labs = [];
let renderedSelection = null;
let modesRequestToken = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value) {
  if (value === undefined || value === null) {
    return "No disponible";
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function renderKeyValueList(values, emptyMessage = "Este modo no publica métricas genéricas. Use el foco de aprendizaje y el JSON crudo para verificar las señales relevantes.") {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null);

  if (!entries.length) {
    return `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<dl>${entries
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>`)
    .join("")}</dl>`;
}

function renderLearning(learning) {
  if (!learning) {
    return "<p class=\"empty-state\">Este modo todavía no expone un contrato de aprendizaje. Inspeccione el JSON crudo para verificarlo.</p>";
  }

  const metrics = learning.keyMetrics?.length
    ? learning.keyMetrics.map((metric) => `
        <li>
          <strong>${escapeHtml(metric.label)}</strong>
          <span>${escapeHtml(formatValue(metric.value))}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</span>
          <p>${escapeHtml(metric.meaning)}</p>
        </li>
      `).join("")
    : "<li><p>Este modo no publicó métricas clave.</p></li>";

  const checklistItems = Array.isArray(learning.checklist) && learning.checklist.length
    ? learning.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>La lista guiada todavía no está disponible para este modo.</li>";

  return `
    <p>${escapeHtml(learning.objective)}</p>
    <ul class="learning-metrics">${metrics}</ul>
    <section class="learning-checklist" aria-label="Lista guiada de aprendizaje">
      <h4>Lista guiada</h4>
      <ul>${checklistItems}</ul>
    </section>
    <p class="takeaway"><strong>Conclusión:</strong> ${escapeHtml(learning.takeaway)}</p>
  `;
}

function renderItems(items) {
  if (!items?.length) {
    return "<p>Sin datos para este modo.</p>";
  }

  return items.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function renderTimeline(timeline) {
  if (!timeline?.length) {
    return "<p>Este modo no publica una línea de tiempo enriquecida.</p>";
  }

  return timeline
    .map((entry) => {
      const details = [
        entry.time ? `tiempo=${entry.time}` : undefined,
        entry.receivedAt ? `recibido=${entry.receivedAt}` : undefined,
        entry.windowStartMs !== undefined && entry.windowEndMs !== undefined ? `ventana=[${entry.windowStartMs}, ${entry.windowEndMs}] ms` : undefined,
        entry.uncertaintyMs !== undefined ? `±${entry.uncertaintyMs} ms` : undefined,
        entry.overlappingWindows !== undefined ? `superposición=${formatValue(entry.overlappingWindows)}` : undefined,
        entry.outOfOrder !== undefined ? `fuera de orden=${formatValue(entry.outOfOrder)}` : undefined,
        entry.decision ? `decisión=${entry.decision}` : undefined,
        entry.detail
      ].filter(Boolean).join(" · ");

      return `<div class="timeline-row"><span>${escapeHtml(entry.label)}</span><code>${escapeHtml(details || entry.id)}</code></div>`;
    })
    .join("");
}

function clearResult(message = "Seleccione o ejecute un modo para ver evidencia actualizada.") {
  renderedSelection = null;
  summaryContent.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  observationsContent.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  learningContent.innerHTML = "<p class=\"empty-state\">El resultado anterior se limpió para evitar leer evidencia de otro laboratorio o modo.</p>";
  metricsContent.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  timelineContent.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  rawJson.textContent = "{}";
}

function renderScenarioDetails(result) {
  if (result.mode !== "scenario-analysis") {
    return "";
  }

  const lowBattery = result.raw?.lowBatteryVsMission;
  if (!lowBattery) {
    return "";
  }

  return renderKeyValueList({
    "Diferencia observada": `${lowBattery.differenceMs} ms`,
    "Error estimado": `±${lowBattery.estimatedErrorMs} ms`,
    "Ventanas superpuestas": lowBattery.overlappingWindows,
    "Decisión": lowBattery.decision
  });
}

function renderLifecycleEvidence(evidence) {
  if (!evidence?.lifecycleModel) {
    return "";
  }

  const waits = evidence.lifecycleAnswers?.whoWaits?.length
    ? evidence.lifecycleAnswers.whoWaits.map((item) => `${item.nodeId} detrás de ${item.queuedBehind}`).join("; ")
    : "Nadie antes del primer grant.";
  const enters = evidence.lifecycleAnswers?.whenEnter?.length
    ? evidence.lifecycleAnswers.whenEnter.map((item) => `${item.nodeId} en tick ${item.enterAtTick}`).join("; ")
    : "No disponible";
  const releases = evidence.lifecycleAnswers?.releaseEnables?.length
    ? evidence.lifecycleAnswers.releaseEnables.map((item) => `${item.nodeId} habilita ${item.nextRequestId ?? "fin de cola"}`).join("; ")
    : "No disponible";

  return `
    <section class="decision lifecycle-evidence" aria-label="Evidencia del ciclo de exclusión mutua">
      <strong>Ciclo de exclusión mutua</strong>
      ${renderKeyValueList({
        "Modelo": evidence.lifecycleModel,
        "Quién espera": waits,
        "Quién concede": evidence.lifecycleAnswers?.whoGrants ?? evidence.grantAuthority,
        "Cuándo entra": enters,
        "Qué habilita release": releases,
        "Por qué safety se mantiene": evidence.lifecycleAnswers?.whySafetyHolds
      })}
    </section>
  `;
}

function renderLeaseEvidence(evidence) {
  if (!evidence?.leaseDeadline) {
    return "";
  }

  return `
    <section class="decision lease-evidence" aria-label="Evidencia de lease distribuido">
      <strong>Lease distribuido</strong>
      ${renderKeyValueList({
        "Owner": evidence.owner,
        "Candidate": evidence.candidate,
        "Acquired at": evidence.acquiredAt !== undefined ? `${evidence.acquiredAt} ms` : undefined,
        "Lease deadline": `${evidence.leaseDeadline} ms`,
        "Renew at": evidence.renewAt !== null && evidence.renewAt !== undefined ? `${evidence.renewAt} ms` : undefined,
        "Expired at": evidence.expiredAt !== null && evidence.expiredAt !== undefined ? `${evidence.expiredAt} ms` : "No vencido en este modo",
        "Fencing token": evidence.fencingToken,
        "Token vigente": evidence.currentFencingToken,
        "Advertencia de alcance": evidence.scopeWarning
      })}
    </section>
  `;
}

function renderLeaderElectionEvidence(evidence) {
  if (!evidence?.detectorType) {
    return "";
  }

  return `
    <section class="decision leader-election-evidence" aria-label="Evidencia de elección de líder">
      <strong>Elección de líder</strong>
      ${renderKeyValueList({
        "Cluster": evidence.clusterId,
        "Detector": evidence.detectorType,
        "Líder inicial": evidence.initialLeader,
        "Líder final": evidence.finalLeader,
        "Regla de elección": evidence.electionRule,
        "Timeout": evidence.timeoutPolicy?.failureTimeoutMs !== undefined ? `${evidence.timeoutPolicy.failureTimeoutMs} ms` : undefined,
        "Sospechados": evidence.suspectedNodes?.length ? evidence.suspectedNodes.join(", ") : "Ninguno",
        "Sospechas falsas": evidence.falseSuspicionSubjects?.length ? evidence.falseSuspicionSubjects.join(", ") : "Ninguna",
        "Nodo recuperado": evidence.recoveredNode ? `${evidence.recoveredNode.nodeId} como ${evidence.recoveredNode.roleAfterRecovery}` : undefined,
        "Advertencia de alcance": evidence.scopeWarning
      })}
    </section>
  `;
}

function renderDistributedCoordinationEvidence(evidence) {
  if (!evidence?.decisionModel) {
    return "";
  }

  return `
    <section class="decision distributed-coordination-evidence" aria-label="Evidencia de coordinación distribuida">
      <strong>Coordinación distribuida</strong>
      ${renderKeyValueList({
        "Coordinación": evidence.coordinationId,
        "Líder": evidence.leader,
        "Coordinador final": evidence.finalCoordinator,
        "Recurso": evidence.resourceId,
        "Lease deadline": evidence.lease?.leaseDeadline !== undefined ? `${evidence.lease.leaseDeadline} ms` : undefined,
        "Acción aceptada": evidence.action?.accepted,
        "Razón de acción": evidence.action?.reason,
        "Hechos causales": evidence.causalEvidence?.length,
        "Sospecha": evidence.suspicion?.suspected,
        "Compensación": evidence.compensation?.action,
        "Modelo": evidence.decisionModel,
        "Límite": evidence.boundary
      })}
    </section>
  `;
}

function renderCoordinationIntegrationEvidence(evidence) {
  if (!evidence?.integrationId) {
    return "";
  }

  return `
    <section class="decision coordination-integration-evidence" aria-label="Evidencia integradora de sincronización y coordinación">
      <strong>Integración de sincronización y coordinación</strong>
      ${renderKeyValueList({
        "Integración": evidence.integrationId,
        "Decisión": evidence.decision,
        "Confianza": evidence.confidence,
        "Skew máximo": evidence.physicalTime?.maxSkewMs !== undefined ? `${evidence.physicalTime.maxSkewMs} ms` : undefined,
        "Sincronización confiable": evidence.clockSync?.trusted,
        "Lamport insuficiente": evidence.lamport?.insufficiency,
        "Vector concurrente": evidence.vectorClock?.concurrent,
        "Conflicto causal": evidence.vectorClock?.conflictDetected,
        "Lease vigente": evidence.lease?.validAtAction,
        "Líder estable": evidence.leader?.stable,
        "Líder sospechado": evidence.failureSuspicion?.suspected,
        "Compensación": evidence.compensation?.applied ? evidence.compensation.action : "No aplicada",
        "Límite": evidence.boundary
      })}
    </section>
  `;
}

function renderResult(result) {
  renderedSelection = { labId: result.labId, mode: result.mode };
  summaryContent.innerHTML = [
    renderKeyValueList({
      "Laboratorio": result.labId,
      "Sesión": result.session,
      "Modo": result.mode,
      "Título": result.title,
      "Resumen": result.summary
    }),
    renderScenarioDetails(result)
  ].join("");

  const decisionItems = result.decisions?.map((decision) => `
      <section class="decision">
        <strong>${escapeHtml(decision.title)}</strong>
        <span>${escapeHtml(decision.decision)}</span>
        <p>${escapeHtml(decision.recommendation)}</p>
      </section>
    `) ?? [];

  observationsContent.innerHTML = [
    renderItems(result.observations),
    renderLifecycleEvidence(result.evidence),
    renderLeaseEvidence(result.evidence),
    renderLeaderElectionEvidence(result.evidence),
    renderDistributedCoordinationEvidence(result.evidence),
    renderCoordinationIntegrationEvidence(result.evidence),
    renderItems(result.recommendations),
    ...decisionItems
  ].join("");

  learningContent.innerHTML = renderLearning(result.learning);

  metricsContent.innerHTML = renderKeyValueList(result.metrics ?? {});

  timelineContent.innerHTML = renderTimeline(result.timeline);

  rawJson.textContent = JSON.stringify(result, null, 2);
}

function getSelectedLab() {
  return labs.find((lab) => lab.id === labSelect.value) ?? labs[0];
}

function renderSelectedLabMetadata() {
  const lab = getSelectedLab();
  if (!lab) {
    return;
  }

  labSession.textContent = `Sesión ${lab.session}`;
  labTitle.textContent = lab.title;
  labPurpose.textContent = lab.purpose;
  labRelationship.textContent = lab.relationship ?? "";
}

async function loadLabs() {
  const response = await fetch("/api/labs");
  if (!response.ok) {
    throw new Error(`API respondió ${response.status}`);
  }

  const payload = await response.json();
  labs = payload.labs;
  labSelect.innerHTML = labs
    .map((lab) => `<option value="${escapeHtml(lab.id)}">Sesión ${escapeHtml(lab.session)} · ${escapeHtml(lab.title)}</option>`)
    .join("");
  labSelect.value = labs.find((lab) => lab.id === "coordination-integration")?.id ?? labs.find((lab) => lab.id === "distributed-coordination")?.id ?? labs.find((lab) => lab.id === "leader-election")?.id ?? labs.find((lab) => lab.id === "distributed-locks")?.id ?? labs.find((lab) => lab.id === "mutual-exclusion")?.id ?? labs.find((lab) => lab.id === "vector-clocks")?.id ?? labs.find((lab) => lab.id === "lamport-ordering")?.id ?? labs.find((lab) => lab.id === "clock-sync")?.id ?? labs[0]?.id ?? "";
  renderSelectedLabMetadata();
}

async function loadModes() {
  const lab = getSelectedLab();
  const requestedLabId = lab.id;
  const requestToken = ++modesRequestToken;
  clearResult(`Cargando modos de ${lab.title}.`);
  const response = await fetch(`/api/labs/${encodeURIComponent(requestedLabId)}/modes`);
  if (labSelect.value !== requestedLabId || requestToken !== modesRequestToken) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`API respondió ${response.status}`);
  }

  const payload = await response.json();
  if (labSelect.value !== requestedLabId || requestToken !== modesRequestToken) {
    return false;
  }

  modeSelect.innerHTML = payload.modes
    .map((mode) => `<option value="${escapeHtml(mode.id)}">${escapeHtml(mode.title)}</option>`)
    .join("");
  modeSelect.value = lab.defaultMode ?? payload.modes[0]?.id ?? "";
  return true;
}

async function runSelectedMode() {
  const lab = getSelectedLab();
  const mode = modeSelect.value;
  statusElement.textContent = "Ejecutando modo...";
  runButton.disabled = true;
  const requestedSelection = { labId: lab.id, mode };

  try {
    const response = await fetch(`/api/labs/${encodeURIComponent(lab.id)}/run?mode=${encodeURIComponent(mode)}`);
    if (!response.ok) {
      throw new Error(`API respondió ${response.status}`);
    }

    const result = await response.json();
    if (labSelect.value !== requestedSelection.labId || modeSelect.value !== requestedSelection.mode) {
      clearResult("La selección cambió durante la ejecución; ejecute el modo actual para ver evidencia actualizada.");
      statusElement.textContent = "Resultado descartado porque la selección cambió.";
      return;
    }

    renderResult(result);
    statusElement.textContent = `Modo ${result.mode} cargado.`;
  } catch (error) {
    statusElement.textContent = `No se pudo ejecutar el modo: ${error.message}`;
  } finally {
    runButton.disabled = false;
  }
}

async function init() {
  runButton.disabled = true;
  let requestedLabId = "";
  let modesApplied = false;

  try {
    await loadLabs();
    requestedLabId = labSelect.value;
    modesApplied = await loadModes();
    if (modesApplied) {
      await runSelectedMode();
    }
  } catch (error) {
    statusElement.textContent = `No se pudieron cargar los modos: ${error.message}`;
  } finally {
    if (modesApplied || labSelect.value === requestedLabId) {
      runButton.disabled = false;
    }
  }
}

labSelect.addEventListener("change", async () => {
  runButton.disabled = true;
  const requestedLabId = labSelect.value;
  let modesApplied = false;
  try {
    renderSelectedLabMetadata();
    modesApplied = await loadModes();
    if (modesApplied) {
      await runSelectedMode();
    }
  } catch (error) {
    statusElement.textContent = `No se pudieron cargar los modos del laboratorio: ${error.message}`;
  } finally {
    if (modesApplied || labSelect.value === requestedLabId) {
      runButton.disabled = false;
    }
  }
});

modeSelect.addEventListener("change", () => {
  const lab = getSelectedLab();
  if (renderedSelection?.labId === lab?.id && renderedSelection?.mode === modeSelect.value) {
    return;
  }

  clearResult("El modo cambió; ejecútelo para reemplazar la evidencia anterior.");
  statusElement.textContent = "Modo cambiado. Ejecute el modo para ver evidencia actualizada.";
});

runButton.addEventListener("click", runSelectedMode);
init();
