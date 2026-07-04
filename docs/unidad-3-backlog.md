# Unidad 3 - Backlog estratégico

> Resultado esperado de la unidad: el estudiante deja de pensar en “la hora del evento” como verdad absoluta y aprende a razonar sobre orden, causalidad, consenso, consistencia y observabilidad distribuida.

La Unidad 2 cerró la comunicación distribuida base con PC02. La Unidad 3 avanza sobre coordinación distribuida: qué significa ordenar eventos, tomar decisiones con fallas, reconciliar estados y explicar el sistema con evidencia.

Fuente de verdad académica: `docs/GESTION SID 2026 I.pdf`.

## Ruta propuesta

| Sesión | Tema | Entregable esperado | Aporte a AURA |
|---|---|---|---|
| 21 | Tiempo físico, skew, drift y límites de sincronización | Laboratorio determinístico en `monitor-telemetria` y guía de análisis. | Muestra por qué los timestamps físicos ayudan, pero no prueban orden global. |
| 22 | Sincronización de relojes: visión general y efectos en sistemas distribuidos | Laboratorio determinístico `lab:clock-sync`, tests y guía de análisis. | Explica qué mejora la sincronización física y qué límites mantiene. |
| 23 | Lamport clocks y orden parcial | Laboratorio determinístico `lab:lamport-ordering`, tests, guía y visualización en plataforma. | Permite razonar sobre “ocurrió antes” sin depender solo de hora física. |
| 24 | Vector clocks y causalidad | Laboratorio determinístico `lab:vector-clocks`, tests, guía y visualización en plataforma. | Distingue eventos causalmente relacionados de eventos concurrentes con más precisión. |
| 25 | Exclusión mutua distribuida | Laboratorio determinístico `lab:mutual-exclusion`, tests, guía y visualización en plataforma. | Modela un arbitraje educativo de requests para estudiar una sección crítica compartida; no implementa un mutex distribuido productivo. |
| 26 | Locks distribuidos, leases y riesgos operativos | Laboratorio determinístico `lab:distributed-locks`, tests, guía y visualización en plataforma. | Enseña por qué un lock distribuido necesita ownership temporal, TTL, expiración, renovación prudente y manejo de dueños stale. |
| 27 | Elección de líder y detectores de fallas | Laboratorio determinístico `lab:leader-election`, tests, guía y visualización en plataforma. | Define quién coordina una acción cuando hay múltiples nodos candidatos y fallas parciales. |
| 28 | Coordinación distribuida en escenarios reales | Laboratorio determinístico `lab:distributed-coordination`, tests, guía y visualización en plataforma. | Integra tiempo, causalidad, leases, líder, sospecha de fallas y compensación en decisiones defendibles. |
| 29 | Laboratorio integrador de sincronización y coordinación | Laboratorio determinístico `lab:coordination-integration`, tests, guía y visualización en plataforma. | Prepara la defensa técnica de PC3 con evidencia ejecutable para aceptar, revisar o compensar una acción distribuida. |
| 30 | Práctica Calificada 3 - AURA: Coordinación bajo falla | `docs/instrucciones-laboratorio-sesion-30.md`, `docs/pc3-respuestas.md`, implementación acotada y evidencia de ejecución. | Evalúa aplicación integrada de sincronización, causalidad, leases, fencing, detectores de fallas, elección de líder y decisión arquitectónica. |

## Criterio de avance

Cada sesión debe dejar:

- un concepto distribuido explicado con un escenario de AURA;
- una simulación o prueba determinística;
- una guía breve para interpretar la salida;
- una limitación explícita que el estudiante pueda defender.

## Fuera de alcance inmediato

- No introducir brokers reales antes de necesitar el concepto.
- No integrar `centro-logistica` en la Sesión 21.
- No vender sincronización física como solución completa de orden global.
- No adelantar locks, leases ni elección de líder dentro de las Sesiones 24 y 25.
- No convertir la Sesión 26 en elección de líder, quórum ni infraestructura completa de fencing; el token de fencing queda como evidencia de stale owner.
- No convertir la Sesión 27 en consenso, Raft/Paxos, quórum, membresía productiva, failover real ni rediseño de locks/fencing; el detector de fallas queda como evidencia educativa.
- No convertir la Sesión 28 en consenso, quórum, Raft/Paxos, membresía productiva ni failover real; la coordinación aplicada queda como razonamiento educativo con compensación.
- No convertir la Sesión 29 en consenso, quórum, Raft/Paxos, membresía productiva, transacciones distribuidas ni failover real; la integración queda como defensa PC3 con evidencia de sesiones 21-28.
- No convertir la Fase 5 de PC3 en implementación real de ZooKeeper, etcd, Raft, Paxos, consenso, quórum productivo, membresía productiva, transacciones distribuidas ni failover real; esas herramientas pueden recomendarse conceptualmente en la Fase 6 si se justifican garantías y tradeoffs.

## Evidencia implementada

| Sesión | Evidencia |
|---|---|
| 21 | `services/monitor-telemetria/src/physical-time-lab.js`, `services/monitor-telemetria/test/physical-time-lab.test.js`, `docs/instrucciones-laboratorio-sesion-21.md`. |
| 22 | `services/monitor-telemetria/src/clock-sync-lab.js`, `services/monitor-telemetria/test/clock-sync-lab.test.js`, `docs/instrucciones-laboratorio-sesion-22.md`, script `lab:clock-sync`. |
| 23 | `services/monitor-telemetria/src/lamport-ordering-lab.js`, `services/monitor-telemetria/test/lamport-ordering-lab.test.js`, `docs/instrucciones-laboratorio-sesion-23.md`, script `lab:lamport-ordering`, modo observable `lamport-ordering`. |
| 24 | `services/monitor-telemetria/src/vector-clocks-lab.js`, `services/monitor-telemetria/test/vector-clocks-lab.test.js`, `docs/instrucciones-laboratorio-sesion-24.md`, script `lab:vector-clocks`, modo observable `vector-clocks`. |
| 25 | `services/monitor-telemetria/src/mutual-exclusion-lab.js`, `services/monitor-telemetria/test/mutual-exclusion-lab.test.js`, `docs/instrucciones-laboratorio-sesion-25.md`, script `lab:mutual-exclusion`, modo observable `mutual-exclusion`. |
| 26 | `services/monitor-telemetria/src/distributed-locks-lab.js`, `services/monitor-telemetria/test/distributed-locks-lab.test.js`, `docs/instrucciones-laboratorio-sesion-26.md`, script `lab:distributed-locks`, modo observable `distributed-locks`. |
| 27 | `services/monitor-telemetria/src/leader-election-lab.js`, `services/monitor-telemetria/test/leader-election-lab.test.js`, `docs/instrucciones-laboratorio-sesion-27.md`, script `lab:leader-election`, modo observable `leader-election`. |
| 28 | `services/monitor-telemetria/src/distributed-coordination-lab.js`, `services/monitor-telemetria/test/distributed-coordination-lab.test.js`, `docs/instrucciones-laboratorio-sesion-28.md`, script `lab:distributed-coordination`, modo observable `distributed-coordination`. |
| 29 | `services/monitor-telemetria/src/coordination-integration-lab.js`, `services/monitor-telemetria/test/coordination-integration-lab.test.js`, `docs/instrucciones-laboratorio-sesion-29.md`, script `lab:coordination-integration`, modo observable `coordination-integration`. |
| 30 | `docs/instrucciones-laboratorio-sesion-30.md` como guía oficial de PC3; entrega esperada en `docs/pc3-respuestas.md`, implementación acotada recomendada en `services/centro-logistica/src/pc3-coordination-lab.js` y evidencia de ejecución. |

## Siguiente paso

Ejecutar la Sesión 30 / PC3 usando la evidencia de la Sesión 29 como entrenamiento previo. La evaluación pide aplicar la defensa integrada a un incidente nuevo: coordinación bajo falla con tiempo físico incierto, causalidad, leases, fencing, detector de fallas, elección de líder e interpretación arquitectónica sin implementar consenso real en la fase acotada.
