#!/usr/bin/env node

const DISTRIBUTED_LOCK_MODES = ["lock-acquire-and-hold", "lease-expiry-and-reacquire", "renewal-jitter-and-risk", "stale-owner-and-fencing-warning"];
const RESOURCE_ID = "aura-dispatch-window";
const TTL_MS = 120;

function createLease({ owner, acquiredAt, ttlMs = TTL_MS, fencingToken }) {
  return {
    resourceId: RESOURCE_ID,
    owner,
    acquiredAt,
    leaseDeadline: acquiredAt + ttlMs,
    ttlMs,
    fencingToken
  };
}

function createTimelineEvent(id, label, atMs, decision, detail, extra = {}) {
  return { id, label, time: `t=${atMs}ms`, atMs, decision, detail, ...extra };
}

function simulateAcquireAndHold() {
  const lease = createLease({ owner: "monitor-telemetria", acquiredAt: 1000, fencingToken: 41 });
  const actionAt = 1070;

  return {
    mode: "lock-acquire-and-hold",
    description: "Un dueño adquiere un lease y completa su acción antes del deadline determinístico.",
    owner: lease.owner,
    candidate: "gestor-flota",
    lease,
    action: { actor: lease.owner, atMs: actionAt, accepted: actionAt < lease.leaseDeadline, reason: "owner-within-ttl" },
    expiredAt: null,
    staleOwnerAction: null,
    timeline: [
      createTimelineEvent("acquire", `${lease.owner} adquiere lock`, lease.acquiredAt, "lock-acquired", `deadline=${lease.leaseDeadline}ms`, { owner: lease.owner, fencingToken: lease.fencingToken }),
      createTimelineEvent("hold", `${lease.owner} mantiene lease`, actionAt, "action-accepted", "acción dentro del TTL", { owner: lease.owner, leaseDeadline: lease.leaseDeadline }),
      createTimelineEvent("deadline", "deadline todavía futuro al actuar", lease.leaseDeadline, "lease-deadline", "el lease vence después de la acción aceptada")
    ],
    interpretation: "Un lock con lease es ownership temporal: mientras el dueño actúa antes del deadline, la operación es aceptable sin reclamar liderazgo global."
  };
}

function simulateLeaseExpiryAndReacquire() {
  const firstLease = createLease({ owner: "monitor-telemetria", acquiredAt: 2000, fencingToken: 51 });
  const expiredAt = firstLease.leaseDeadline;
  const reacquiredAt = 2135;
  const nextLease = createLease({ owner: "gestor-flota", acquiredAt: reacquiredAt, fencingToken: 52 });

  return {
    mode: "lease-expiry-and-reacquire",
    description: "El dueño original queda stale después del TTL y otro nodo reacquiere el lock con un token mayor.",
    owner: firstLease.owner,
    candidate: nextLease.owner,
    lease: firstLease,
    nextLease,
    expiredAt,
    staleOwnerAction: null,
    timeline: [
      createTimelineEvent("acquire-original", `${firstLease.owner} adquiere lock`, firstLease.acquiredAt, "lock-acquired", `token=${firstLease.fencingToken}`, { owner: firstLease.owner, fencingToken: firstLease.fencingToken }),
      createTimelineEvent("expired", "lease original expira", expiredAt, "lease-expired", `${firstLease.owner} ya no conserva ownership válido`, { owner: firstLease.owner }),
      createTimelineEvent("reacquire", `${nextLease.owner} reacquiere lock`, reacquiredAt, "lock-reacquired", `nuevo deadline=${nextLease.leaseDeadline}ms`, { owner: nextLease.owner, fencingToken: nextLease.fencingToken })
    ],
    interpretation: "La expiración permite recuperar disponibilidad, pero crea riesgo si el dueño anterior despierta y actúa como si todavía tuviera ownership."
  };
}

function simulateRenewalJitterAndRisk() {
  const lease = createLease({ owner: "centro-logistica", acquiredAt: 3000, fencingToken: 61 });
  const renewAt = 3110;
  const renewalJitterMs = 5;
  const observedAt = renewAt + renewalJitterMs;
  const renewalSlackMs = lease.leaseDeadline - observedAt;
  const renewed = observedAt < lease.leaseDeadline;

  return {
    mode: "renewal-jitter-and-risk",
    description: "La renovación se programa cerca del deadline y un jitter pequeño deja incertidumbre operacional.",
    owner: lease.owner,
    candidate: "monitor-telemetria",
    lease,
    renewAt,
    renewal: { scheduledAt: renewAt, observedAt, renewalJitterMs, renewalSlackMs, accepted: renewed, risk: renewalSlackMs <= 0 ? "expired-before-renewal" : "near-deadline" },
    expiredAt: renewed ? null : lease.leaseDeadline,
    staleOwnerAction: null,
    timeline: [
      createTimelineEvent("acquire", `${lease.owner} adquiere lock`, lease.acquiredAt, "lock-acquired", `deadline=${lease.leaseDeadline}ms`, { owner: lease.owner, fencingToken: lease.fencingToken }),
      createTimelineEvent("renew-scheduled", `${lease.owner} agenda renovación`, renewAt, "renewal-scheduled", "renovación demasiado cerca del deadline", { renewAt }),
      createTimelineEvent("renew-observed", "renovación observada con jitter", observedAt, renewed ? "renewal-risk" : "renewal-missed", `slack=${renewalSlackMs}ms`, { renewalJitterMs, renewalSlackMs })
    ],
    interpretation: "Renovar cerca del vencimiento es una decisión frágil: el lease puede seguir siendo válido en la simulación, pero el margen operativo ya no es defendible."
  };
}

function simulateStaleOwnerAndFencingWarning() {
  const firstLease = createLease({ owner: "monitor-telemetria", acquiredAt: 4000, fencingToken: 71 });
  const expiredAt = firstLease.leaseDeadline;
  const nextLease = createLease({ owner: "gestor-flota", acquiredAt: 4130, fencingToken: 72 });
  const staleOwnerAction = {
    actor: firstLease.owner,
    atMs: 4140,
    providedFencingToken: firstLease.fencingToken,
    currentFencingToken: nextLease.fencingToken,
    accepted: false,
    reason: "stale-owner-token-lower-than-current"
  };

  return {
    mode: "stale-owner-and-fencing-warning",
    description: "Un dueño stale intenta actuar después de perder el lease; el token de fencing evidencia el riesgo y la acción se rechaza.",
    owner: firstLease.owner,
    candidate: nextLease.owner,
    lease: firstLease,
    nextLease,
    expiredAt,
    staleOwnerAction,
    timeline: [
      createTimelineEvent("acquire-original", `${firstLease.owner} adquiere lock`, firstLease.acquiredAt, "lock-acquired", `token=${firstLease.fencingToken}`, { owner: firstLease.owner, fencingToken: firstLease.fencingToken }),
      createTimelineEvent("expired", "lease original expira", expiredAt, "lease-expired", `${firstLease.owner} queda stale`, { owner: firstLease.owner }),
      createTimelineEvent("reacquire", `${nextLease.owner} reacquiere lock`, nextLease.acquiredAt, "lock-reacquired", `token=${nextLease.fencingToken}`, { owner: nextLease.owner, fencingToken: nextLease.fencingToken }),
      createTimelineEvent("stale-action", `${firstLease.owner} intenta acción stale`, staleOwnerAction.atMs, "fencing-warning-rejected", "token anterior menor que token vigente", staleOwnerAction)
    ],
    interpretation: "El fencing token aparece solo como evidencia operativa: advierte/rechaza una acción stale, pero esta sesión no implementa infraestructura completa de fencing."
  };
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function runDistributedLocksLab(options = {}) {
  const mode = options.mode ?? "lock-acquire-and-hold";
  if (mode === "lock-acquire-and-hold") return simulateAcquireAndHold();
  if (mode === "lease-expiry-and-reacquire") return simulateLeaseExpiryAndReacquire();
  if (mode === "renewal-jitter-and-risk") return simulateRenewalJitterAndRisk();
  if (mode === "stale-owner-and-fencing-warning") return simulateStaleOwnerAndFencingWarning();

  throw new Error(`distributed locks mode '${mode}' is not supported. Use one of: ${DISTRIBUTED_LOCK_MODES.join(", ")}`);
}

function createMetrics(raw) {
  const activeLease = raw.nextLease ?? raw.lease;
  return {
    ttlMs: raw.lease.ttlMs,
    leaseDeadline: raw.lease.leaseDeadline,
    expired: raw.expiredAt !== null,
    reacquired: Boolean(raw.nextLease),
    fencingToken: activeLease.fencingToken,
    staleOwnerRejected: raw.staleOwnerAction?.accepted === false,
    renewalSlackMs: raw.renewal?.renewalSlackMs ?? null,
    nearDeadlineRenewal: raw.renewal?.risk === "near-deadline"
  };
}

function createEvidence(raw) {
  return {
    resourceId: RESOURCE_ID,
    owner: raw.owner,
    candidate: raw.candidate,
    acquiredAt: raw.lease.acquiredAt,
    leaseDeadline: raw.lease.leaseDeadline,
    renewAt: raw.renewAt ?? null,
    expiredAt: raw.expiredAt,
    fencingToken: raw.lease.fencingToken,
    currentFencingToken: raw.nextLease?.fencingToken ?? raw.lease.fencingToken,
    staleOwnerAction: raw.staleOwnerAction,
    leaseState: raw.expiredAt ? "expired-or-reacquired" : "held-within-ttl",
    scopeWarning: "Fencing token is evidence only in Session 26; leader election, quorum systems and full fencing infrastructure are out of scope."
  };
}

function createObservations(raw) {
  if (raw.mode === "lease-expiry-and-reacquire") {
    return [
      "La expiración del lease permite que otro nodo recupere el recurso sin esperar indefinidamente al dueño anterior.",
      "El dueño anterior se vuelve stale al pasar el deadline; cualquier acción posterior necesita validación adicional."
    ];
  }
  if (raw.mode === "renewal-jitter-and-risk") {
    return [
      "La renovación cerca del deadline conserva muy poco margen ante jitter, pausas o retrasos de red.",
      "Un lease renovado tarde puede parecer correcto localmente y ser inseguro operacionalmente."
    ];
  }
  if (raw.mode === "stale-owner-and-fencing-warning") {
    return [
      "Un owner stale puede despertar después de que otro nodo reacquirió el lock.",
      "El token de fencing evidencia que la acción pertenece a una generación anterior y debe rechazarse."
    ];
  }
  return [
    "El lock no es permanente: el ownership está acotado por TTL y leaseDeadline.",
    "Mientras la acción ocurre dentro del TTL, el caso base no necesita elegir un líder global."
  ];
}

function createDecisions() {
  return [
    createDecision("lease-not-permanent-lock", "Lease con TTL", "ownership-temporal", "Modele todo lock distribuido como ownership temporal con acquiredAt y leaseDeadline explícitos."),
    createDecision("renewal-margin", "Renovación con margen", "no-renovar-en-el-deadline", "Renueve antes del deadline con margen suficiente para jitter, pausas y latencia."),
    createDecision("stale-owner-risk", "Dueño stale", "validar-generacion", "Trate acciones posteriores al vencimiento como sospechosas aunque el nodo crea seguir siendo dueño."),
    createDecision("fencing-evidence-only", "Fencing token como evidencia", "advertencia-no-infraestructura", "Use el token para explicar rechazo de stale owner; no lo presente como fencing completo en esta sesión.")
  ];
}

function createLearning(raw, metrics) {
  return {
    objective: "Explicar cómo locks distribuidos con leases protegen ownership temporal y dónde aparecen riesgos por expiración, renovación y dueños stale.",
    keyMetrics: [
      { label: "TTL", value: metrics.ttlMs, unit: "ms", meaning: "Tiempo máximo de validez del lease antes de requerir renovación o reacquisición." },
      { label: "Deadline", value: metrics.leaseDeadline, unit: "ms", meaning: "Instante simulado hasta el cual el dueño puede defender ownership." },
      { label: "Reacquired", value: metrics.reacquired, unit: "boolean", meaning: "Indica si otro nodo tomó ownership después de la expiración." },
      { label: "Stale owner rejected", value: metrics.staleOwnerRejected, unit: "boolean", meaning: "Evidencia de rechazo cuando un dueño vencido intenta actuar." },
      { label: "Renewal slack", value: metrics.renewalSlackMs, unit: "ms", meaning: "Margen restante observado al renovar; valores bajos son riesgo operacional." }
    ],
    checklist: [
      "Identifique owner, candidate, acquiredAt y leaseDeadline.",
      "Determine si la acción ocurre antes o después del TTL.",
      "Explique qué pasa cuando otro nodo reacquiere después de expiredAt.",
      "Evalúe si renewAt deja margen suficiente ante jitter.",
      "Use fencingToken solo como evidencia de stale owner, no como rediseño completo."
    ],
    takeaway: "Un lock distribuido útil no es solo 'tengo la llave': es una promesa temporal que vence, puede renovarse mal y debe defenderse frente a dueños stale."
  };
}

function createDistributedLocksLabResult(options = {}) {
  const raw = runDistributedLocksLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions(raw);
  return {
    labId: "distributed-locks",
    session: 26,
    mode: raw.mode,
    title: "Sesión 26: Locks distribuidos, leases y riesgos operativos",
    summary: raw.interpretation,
    inputs: { mode: raw.mode, resourceId: RESOURCE_ID, ttlMs: TTL_MS },
    metrics,
    observations: createObservations(raw),
    decisions,
    evidence: createEvidence(raw),
    timeline: raw.timeline,
    learning: createLearning(raw, metrics),
    recommendations: decisions.map((decision) => decision.recommendation),
    raw
  };
}

function parseArgs(argv) {
  const options = { mode: "lock-acquire-and-hold" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (DISTRIBUTED_LOCK_MODES.map((mode) => `--${mode}`).includes(arg)) {
      options.mode = arg.slice(2);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--timeline") {
      options.timeline = true;
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }
  return options;
}

function printTimeline(result) {
  console.log("Línea de tiempo Locks distribuidos");
  result.timeline.forEach((entry) => console.log(`- ${entry.label}: ${entry.time} ${entry.detail}`));
}

function printReport(report) {
  console.log(`Laboratorio de Locks distribuidos: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Evidencia de lease");
  console.log(`- Owner: ${report.evidence.owner}`);
  console.log(`- Candidate: ${report.evidence.candidate}`);
  console.log(`- Acquired at: ${report.evidence.acquiredAt}ms`);
  console.log(`- Lease deadline: ${report.evidence.leaseDeadline}ms`);
  console.log(`- Expired at: ${report.evidence.expiredAt ?? "no vencido"}`);
  console.log(`- Fencing token: ${report.evidence.fencingToken}`);
  console.log(`- Alcance: ${report.evidence.scopeWarning}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createDistributedLocksLabResult(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.timeline) {
    printTimeline(result);
    return;
  }
  printReport(result);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  DISTRIBUTED_LOCK_MODES,
  createDistributedLocksLabResult,
  createLease,
  parseArgs,
  runDistributedLocksLab,
  simulateAcquireAndHold,
  simulateLeaseExpiryAndReacquire,
  simulateRenewalJitterAndRisk,
  simulateStaleOwnerAndFencingWarning
};
