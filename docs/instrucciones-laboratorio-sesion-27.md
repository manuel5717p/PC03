# Sesión 27 — Elección de líder y detectores de fallas

## Objetivo

Estudiar cómo un grupo de nodos puede elegir un coordinador educativo y cómo un detector de fallas basado en heartbeats puede sospechar fallas reales o producir falsos positivos.

El laboratorio usa una simulación determinística sobre `aura-coordination-ring`:

```text
leader = mayor prioridad entre candidatos no sospechados
sospecha = checkedAt - lastHeartbeatAt >= failureTimeoutMs
lastHeartbeatAt = momento en que el observador recibió el último heartbeat
detector de fallas = evidencia temporal, no prueba absoluta
recuperación = rejoin como follower para evitar thrashing
```

## Alcance

Esta sesión cubre elección determinística de líder, heartbeats, timeout, sospecha confirmada, sospecha falsa, reelección y reincorporación de un nodo recuperado.

Quedan explícitamente fuera de alcance:

- consenso distribuido;
- Raft, Paxos o protocolos equivalentes;
- sistemas de quórum;
- servicio productivo de membresía;
- failover real de servicios;
- rediseño de locks, fencing o plataforma de observabilidad.

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:leader-election -- --stable-leader-heartbeats
npm run lab:leader-election -- --leader-failure-and-reelection
npm run lab:leader-election -- --false-suspicion-timeout
npm run lab:leader-election -- --leader-recovery-rejoin
```

Salida JSON para inspección o automatización:

```bash
npm run lab:leader-election -- --leader-failure-and-reelection --json
```

Línea de tiempo:

```bash
npm run lab:leader-election -- --false-suspicion-timeout --timeline
```

## Modos

| Modo | Qué demuestra | Pregunta de defensa |
|---|---|---|
| `stable-leader-heartbeats` | Un líder estable emite heartbeats dentro del timeout. | ¿Qué evidencia muestra que no corresponde iniciar reelección? |
| `leader-failure-and-reelection` | El líder supera el timeout, queda sospechado y se elige un nuevo coordinador. | ¿Por qué una sospecha habilita reelección pero no prueba consenso global? |
| `false-suspicion-timeout` | Un heartbeat tardío genera sospecha falsa antes de llegar. | ¿Qué tradeoff existe entre detección rápida y falsos positivos? |
| `leader-recovery-rejoin` | El líder original vuelve después de una reelección y se reincorpora como follower. | ¿Por qué no debería recuperar liderazgo automáticamente? |

## Cómo leer la evidencia

Revise estos campos en la salida estructurada:

- `evidence.initialLeader`: líder al iniciar el escenario.
- `evidence.finalLeader`: líder vigente al cierre del escenario.
- `evidence.detectorType`: tipo de detector simulado.
- `evidence.timeoutPolicy.failureTimeoutMs`: silencio máximo antes de sospechar.
- `evidence.suspectedNodes`: nodos sospechados por timeout.
- `evidence.falseSuspicionSubjects`: sospechas que luego se limpian por evidencia tardía.
- `evidence.recoveredNode`: nodo recuperado y rol posterior cuando aplica.
- `metrics.leaderChanges`: cambios de líder observados.
- `metrics.falseSuspicions`: cantidad de sospechas falsas.
- `metrics.failoverMs`: tiempo simulado entre el último heartbeat recibido del líder original y la reelección.
- `timeline`: muestra heartbeats, sospechas, reelección y reincorporación.

## Relación con sesiones anteriores

- La Sesión 21 mostró que el tiempo físico tiene skew, drift e incertidumbre.
- La Sesión 22 explicó que sincronizar relojes ayuda, pero no elimina el error.
- La Sesión 23 introdujo orden lógico con Lamport.
- La Sesión 24 distinguió causalidad y concurrencia con vector clocks.
- La Sesión 25 protegió una sección crítica con arbitraje determinístico.
- La Sesión 26 agregó ownership temporal con locks, leases, TTL y dueños stale.
- La Sesión 27 introduce coordinación por líder y evidencia de fallas parciales sin implementar consenso.

## Checklist de aprendizaje

- [ ] Identificar líder inicial, líder final y regla de elección.
- [ ] Calcular `silenceMs` desde el último heartbeat recibido por el observador y compararlo con `failureTimeoutMs`.
- [ ] Distinguir sospecha confirmada de sospecha falsa.
- [ ] Explicar por qué un heartbeat tardío limpia una sospecha.
- [ ] Justificar por qué un nodo recuperado vuelve como follower.
- [ ] Defender por qué esta sesión no implementa consenso, quórum ni membresía productiva.

## Conclusión

Elegir un líder en un sistema distribuido no elimina las fallas parciales. Solo define quién coordina mientras la evidencia disponible lo permite. Un detector de fallas ayuda a reaccionar, pero sus sospechas no son pruebas absolutas: el diseño debe reconocer falsos positivos, recuperación y estabilidad del liderazgo.
