const { createLeaderElectionLabResult } = require("../../../monitor-telemetria/src/leader-election-lab");

const LEADER_ELECTION_MODES = [
  {
    id: "stable-leader-heartbeats",
    title: "Líder estable con heartbeats",
    description: "Muestra un líder que sostiene coordinación con heartbeats dentro del timeout."
  },
  {
    id: "leader-failure-and-reelection",
    title: "Falla de líder y reelección",
    description: "Expone sospecha por timeout y elección de un nuevo coordinador."
  },
  {
    id: "false-suspicion-timeout",
    title: "Sospecha falsa por timeout",
    description: "Compara detección rápida contra falsos positivos por heartbeats demorados."
  },
  {
    id: "leader-recovery-rejoin",
    title: "Recuperación y reincorporación",
    description: "Muestra un líder recuperado que vuelve como follower para evitar thrashing."
  }
];

function listLeaderElectionModes() {
  return LEADER_ELECTION_MODES;
}

function runLeaderElectionObservabilityLab(mode = "stable-leader-heartbeats") {
  if (!LEADER_ELECTION_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`leader-election mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createLeaderElectionLabResult({ mode });
}

module.exports = {
  listLeaderElectionModes,
  runLeaderElectionObservabilityLab
};
