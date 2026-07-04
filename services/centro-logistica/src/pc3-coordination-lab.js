/**
 * PC3 - AURA Coordinación bajo Falla
 * Fase 5: Implementación acotada.
 *
 * Simula, con reglas locales y sin infraestructura distribuida real:
 *  - cálculo de leaseDeadline y detección de lease vencido;
 *  - rechazo por fencing token menor al último aceptado;
 *  - rechazo de comandos emitidos por líderes viejos (epoch);
 *  - prevención de doble asignación de Drone-Alpha-1;
 *  - salida estructurada que explica cada decisión.
 *
 * Ejecución: node services/centro-logistica/src/pc3-coordination-lab.js
 */

class FleetManager {
  constructor() {
    this.assignments = new Map();
    this.latestFenceByDrone = new Map();
    this.currentLeaderEpoch = 7;
    this.auditLog = [];
  }

  assignDroneIfAvailable({ droneId, missionId, actor, nowMs, lease, fence, leader }) {
    const checks = {
      leaderEpoch: leader.epoch,
      currentLeaderEpoch: this.currentLeaderEpoch,
      leaseDeadline: lease.acquiredAtMs + lease.ttlMs,
      nowMs,
      fence,
      latestAcceptedFence: this.latestFenceByDrone.get(droneId) ?? null,
    };

    // 1. Rechazar líderes viejos antes de tocar el estado.
    if (this.isLeaderStale(leader)) {
      return this.decide({
        decision: 'rejected',
        reason: 'stale-leader',
        detail: `epoch ${leader.epoch} < epoch vigente ${this.currentLeaderEpoch}`,
        droneId, missionId, actor, checks,
      });
    }

    // 2. Rechazar escrituras con lease vencido (owner stale).
    if (this.isLeaseExpired(lease, nowMs)) {
      return this.decide({
        decision: 'rejected',
        reason: 'stale-owner-or-fence',
        detail: `lease vencido: deadline=${checks.leaseDeadline}ms < now=${nowMs}ms`,
        droneId, missionId, actor, checks,
      });
    }

    // 3. Rechazar fences menores o iguales al último aceptado.
    if (this.isFenceStale(droneId, fence)) {
      return this.decide({
        decision: 'rejected',
        reason: 'stale-owner-or-fence',
        detail: `fence ${fence} <= último fence aceptado ${this.latestFenceByDrone.get(droneId)}`,
        droneId, missionId, actor, checks,
      });
    }

    // 4. Prevenir doble asignación.
    if (this.assignments.has(droneId)) {
      const current = this.assignments.get(droneId);
      return this.decide({
        decision: 'rejected',
        reason: 'drone-already-assigned',
        detail: `${droneId} ya asignado a ${current.missionId} (fence ${current.fence})`,
        droneId, missionId, actor, checks,
      });
    }

    // 5. Persistir solo asignaciones seguras.
    this.assignments.set(droneId, { missionId, actor, fence, assignedAtMs: nowMs });
    this.latestFenceByDrone.set(droneId, fence);
    return this.decide({
      decision: 'accepted',
      reason: 'all-checks-passed',
      detail: `asignación persistida con fence ${fence} bajo epoch ${leader.epoch}`,
      droneId, missionId, actor, checks,
    });
  }

  isLeaseExpired(lease, nowMs) {
    return nowMs > lease.acquiredAtMs + lease.ttlMs;
  }

  isFenceStale(droneId, fence) {
    const latest = this.latestFenceByDrone.get(droneId);
    return latest !== undefined && fence <= latest;
  }

  isLeaderStale(leader) {
    return leader.epoch < this.currentLeaderEpoch;
  }

  decide(entry) {
    this.auditLog.push(entry);
    const { decision, reason, detail, missionId, checks } = entry;
    return decision === 'accepted'
      ? { decision, missionId, fence: checks.fence, detail, checks }
      : { decision, reason, detail, checks };
  }
}

function runScenario() {
  const fleetManager = new FleetManager();

  // LC2: lease vigente, fence 22, líder vigente (RP4, epoch 7) -> debe aceptarse.
  const lc2 = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2002',
    actor: 'LC2',
    nowMs: 4600,
    lease: { lockKey: 'lock:drone:Alpha', owner: 'LC2', acquiredAtMs: 4500, ttlMs: 3000 },
    fence: 22,
    leader: { id: 'RP4', epoch: 7 },
  });

  // LC1 despierta tras bloqueo de 4500ms: lease vencido (deadline=3000 < now=7600)
  // y fence 21 < 22 -> debe rechazarse.
  const lc1Old = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2001',
    actor: 'LC1-old',
    nowMs: 7600,
    lease: { lockKey: 'lock:drone:Alpha', owner: 'LC1', acquiredAtMs: 0, ttlMs: 3000 },
    fence: 21,
    leader: { id: 'RP4', epoch: 7 },
  });

  // RP5 despierta creyéndose líder con epoch 6 < 7 -> debe rechazarse por stale-leader.
  const rp5OldLeader = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2003',
    actor: 'RP5-old-leader',
    nowMs: 8000,
    lease: { lockKey: 'lock:drone:Alpha', owner: 'RP5', acquiredAtMs: 0, ttlMs: 3000 },
    fence: 20,
    leader: { id: 'RP5', epoch: 6 },
  });

  return {
    lc2,
    lc1Old,
    rp5OldLeader,
    assignments: Array.from(fleetManager.assignments.entries()),
    auditLog: fleetManager.auditLog.map(({ actor, decision, reason, detail }) => ({
      actor, decision, reason, detail,
    })),
    limitations: [
      'Simulación en un solo proceso: no hay red, particiones ni relojes reales.',
      'El epoch vigente y los fences se validan en memoria local, no en un store consensuado.',
      'nowMs es un tiempo lógico inyectado, no un reloj monotónico real.',
      'No se implementa elección de líder ni renovación de leases: solo la validación en el recurso protegido.',
    ],
  };
}

console.log(JSON.stringify(runScenario(), null, 2));
