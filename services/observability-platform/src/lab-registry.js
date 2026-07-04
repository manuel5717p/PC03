const { listClockSyncModes, runClockSyncLab } = require("./adapters/clock-sync-adapter");
const { listCoordinationIntegrationModes, runCoordinationIntegrationObservabilityLab } = require("./adapters/coordination-integration-adapter");
const { listDistributedCoordinationModes, runDistributedCoordinationObservabilityLab } = require("./adapters/distributed-coordination-adapter");
const { listDistributedLocksModes, runDistributedLocksObservabilityLab } = require("./adapters/distributed-locks-adapter");
const { listLamportOrderingModes, runLamportOrderingObservabilityLab } = require("./adapters/lamport-ordering-adapter");
const { listLeaderElectionModes, runLeaderElectionObservabilityLab } = require("./adapters/leader-election-adapter");
const { listMutualExclusionModes, runMutualExclusionObservabilityLab } = require("./adapters/mutual-exclusion-adapter");
const { listPhysicalTimeModes, runPhysicalTimeObservabilityLab } = require("./adapters/physical-time-adapter");
const { listVectorClocksModes, runVectorClocksObservabilityLab } = require("./adapters/vector-clocks-adapter");

const labs = [
  {
    id: "physical-time",
    session: 21,
    title: "Tiempo físico, skew, drift y límites de sincronización",
    purpose: "Construir el fundamento de incertidumbre temporal antes de aplicar políticas de sincronización de relojes.",
    relationship: "Fundamento para la Sesión 22: sincronización de relojes",
    defaultMode: "normal",
    modes: listPhysicalTimeModes,
    run: runPhysicalTimeObservabilityLab
  },
  {
    id: "clock-sync",
    session: 22,
    title: "Sincronización de relojes",
    purpose: "Observar cuándo los timestamps sincronizados ayudan y cuándo todavía dejan incertidumbre operacional.",
    relationship: "Continúa la Sesión 21: límites del tiempo físico; prepara Lamport en la Sesión 23",
    defaultMode: "scenario-analysis",
    modes: listClockSyncModes,
    run: runClockSyncLab
  },
  {
    id: "lamport-ordering",
    session: 23,
    title: "Lamport clocks y orden parcial",
    purpose: "Razonar sobre happened-before con relojes lógicos sin depender solo de timestamps físicos sincronizados.",
    relationship: "Consolida Sesiones 21/22 sobre tiempo físico y prepara vector clocks en la Sesión 24",
    defaultMode: "causal-chain",
    modes: listLamportOrderingModes,
    run: runLamportOrderingObservabilityLab
  },
  {
    id: "vector-clocks",
    session: 24,
    title: "Vector clocks y causalidad",
    purpose: "Detectar happened-before, concurrencia e incomparabilidad con relojes vectoriales.",
    relationship: "Extiende Lamport de la Sesión 23 y prepara exclusión mutua distribuida en la Sesión 25",
    defaultMode: "causal-chain",
    modes: listVectorClocksModes,
    run: runVectorClocksObservabilityLab
  },
  {
    id: "mutual-exclusion",
    session: 25,
    title: "Exclusión mutua distribuida y sección crítica",
    purpose: "Probar request, espera, grant, entrada y release sobre un recurso compartido de AURA con una cola determinística.",
    relationship: "Extiende causalidad de la Sesión 24 y prepara locks/leases en la Sesión 26",
    defaultMode: "contended-queue",
    modes: listMutualExclusionModes,
    run: runMutualExclusionObservabilityLab
  },
  {
    id: "distributed-locks",
    session: 26,
    title: "Locks distribuidos, leases y riesgos operativos",
    purpose: "Observar ownership temporal, expiración, reacquisición, renovación riesgosa y owner stale sin adelantar liderazgo ni quórum.",
    relationship: "Extiende exclusión mutua de la Sesión 25 y prepara elección de líder/detectores de fallas en la Sesión 27",
    defaultMode: "lock-acquire-and-hold",
    modes: listDistributedLocksModes,
    run: runDistributedLocksObservabilityLab
  },
  {
    id: "leader-election",
    session: 27,
    title: "Elección de líder y detectores de fallas",
    purpose: "Comparar líder estable, sospecha por timeout, reelección, sospecha falsa y reincorporación con evidencia determinística.",
    relationship: "Extiende locks/leases de la Sesión 26 y prepara coordinación distribuida aplicada en la Sesión 28",
    defaultMode: "stable-leader-heartbeats",
    modes: listLeaderElectionModes,
    run: runLeaderElectionObservabilityLab
  },
  {
    id: "distributed-coordination",
    session: 28,
    title: "Coordinación distribuida en escenarios reales",
    purpose: "Combinar tiempo, evidencia causal, leases, líder y sospechas de falla para tomar decisiones AURA defendibles.",
    relationship: "Extiende la Sesión 27 y prepara el laboratorio integrador de sincronización y coordinación en la Sesión 29",
    defaultMode: "coordinated-dispatch-handoff",
    modes: listDistributedCoordinationModes,
    run: runDistributedCoordinationObservabilityLab
  },
  {
    id: "coordination-integration",
    session: 29,
    title: "Laboratorio integrador de sincronización y coordinación",
    purpose: "Defender una decisión distribuida de AURA con evidencia integrada de tiempo físico, sincronización, Lamport, vector clocks, leases, líder, sospecha y compensación.",
    relationship: "Integra las Sesiones 21-28 y prepara la defensa técnica de PC3 sin implementar consenso ni failover productivo",
    defaultMode: "pc3-ready-happy-path",
    modes: listCoordinationIntegrationModes,
    run: runCoordinationIntegrationObservabilityLab
  }
];

function listLabs() {
  return labs.map(({ id, session, title, purpose, relationship, defaultMode }) => ({ id, session, title, purpose, relationship, defaultMode }));
}

function getLab(id) {
  return labs.find((lab) => lab.id === id);
}

function listLabModes(id) {
  const lab = getLab(id);
  if (!lab) {
    return null;
  }

  return lab.modes();
}

function runLab(id, mode) {
  const lab = getLab(id);
  if (!lab) {
    const error = new Error(`lab '${id}' was not found`);
    error.statusCode = 404;
    throw error;
  }

  return lab.run(mode);
}

module.exports = {
  getLab,
  listLabModes,
  listLabs,
  runLab
};
