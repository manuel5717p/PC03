# Sesión 28 — Coordinación distribuida en escenarios reales

## Objetivo

Integrar los conceptos previos de la Unidad 3 en una decisión coordinada de AURA: tiempo, evidencia causal, leases/locks, líder y sospecha de fallas.

El laboratorio no busca implementar consenso ni failover productivo. Busca que el estudiante pueda defender una decisión limitada con evidencia explícita:

```text
decisión coordinada = evidencia causal + lease vigente + líder actual + estado de sospecha
acción tardía = rechazar o compensar, aunque tenga una historia causal explicable
sospecha de líder = degradar coordinación, no prometer failover mágico
```

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:distributed-coordination -- --coordinated-dispatch-handoff
npm run lab:distributed-coordination -- --expired-lease-prevention
npm run lab:distributed-coordination -- --degraded-compensation
```

Salida JSON:

```bash
npm run lab:distributed-coordination -- --degraded-compensation --json
```

Línea de tiempo:

```bash
npm run lab:distributed-coordination -- --expired-lease-prevention --timeline
```

## Modos

| Modo | Qué demuestra | Pregunta de defensa |
|---|---|---|
| `coordinated-dispatch-handoff` | Un líder acepta un handoff porque existe precondición causal y lease vigente. | ¿Qué evidencia permite aceptar el despacho sin afirmar consenso global? |
| `expired-lease-prevention` | Una acción causalmente explicable se rechaza porque llega después del `leaseDeadline`. | ¿Por qué causalidad no reemplaza ownership temporal? |
| `degraded-compensation` | Una sospecha del líder degrada el flujo y aplica compensación/reencolado. | ¿Por qué compensar es más honesto que prometer failover productivo? |

## Campos de evidencia

Revise estos campos en la salida estructurada:

- `evidence.coordinationId`: escenario de coordinación aplicado.
- `evidence.leader`: nodo que coordina inicialmente.
- `evidence.finalCoordinator`: nodo que queda a cargo al cierre del modo.
- `evidence.lease`: ownership temporal usado para defender o rechazar la acción.
- `evidence.action`: acción coordinada, instante y razón de aceptación/rechazo.
- `evidence.causalEvidence`: hechos causales que explican la decisión.
- `evidence.suspicion`: evidencia temporal de sospecha del líder cuando aplica.
- `evidence.compensation`: acción degradada para evitar duplicación o pérdida de trazabilidad.
- `evidence.decisionModel`: combinación explícita de señales usadas para decidir.
- `evidence.boundary`: límite académico del laboratorio.
- `metrics.actionWithinLease`, `metrics.actionAccepted`, `metrics.leaderSuspected` y `metrics.compensationApplied`: resumen cuantitativo del modo.

## Checklist de aprendizaje

- [ ] Identificar la precondición causal del despacho.
- [ ] Comparar `actionAtMs` contra `leaseDeadline` antes de aceptar una acción.
- [ ] Distinguir liderazgo educativo de consenso distribuido.
- [ ] Explicar qué evidencia sostiene una sospecha del líder.
- [ ] Justificar cuándo corresponde compensar/reencolar en vez de duplicar el despacho.
- [ ] Defender que el laboratorio no implementa quórum, Raft/Paxos ni failover productivo.

## No objetivos

Quedan fuera de alcance:

- consenso distribuido;
- quórum;
- Raft, Paxos o protocolos equivalentes;
- membresía productiva;
- failover real de servicios;
- infraestructura productiva de fencing;
- garantías de disponibilidad o consistencia propias de un sistema de producción.

## Conclusión

La coordinación distribuida real no aparece por sumar palabras como “líder”, “lock” o “timestamp”. Aparece cuando una acción puede defenderse con evidencia limitada, cuando los límites se respetan y cuando una degradación se compensa sin vender certezas que el sistema no tiene.
