# Sesión 29 — Laboratorio integrador de sincronización y coordinación

## Objetivo

Preparar la defensa técnica de PC3 con un laboratorio integrador. Esta sesión no introduce un concepto aislado: obliga a defender una decisión distribuida usando evidencia acumulada de las Sesiones 21-28.

La pregunta central es:

```text
¿Acepto, reviso o compenso una acción de AURA con la evidencia distribuida disponible?
```

La evidencia debe cruzar:

- tiempo físico, skew y tolerancia;
- sincronización de relojes, offset, delay y confianza;
- Lamport clocks para orden parcial;
- vector clocks para concurrencia y conflicto causal;
- leases como ownership temporal;
- líder actual y estabilidad;
- sospecha por timeout;
- compensación cuando aceptar sería inseguro.

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:coordination-integration -- --pc3-ready-happy-path
npm run lab:coordination-integration -- --causal-conflict-review
npm run lab:coordination-integration -- --suspected-leader-compensation
```

Salida JSON:

```bash
npm run lab:coordination-integration -- --causal-conflict-review --json
```

Línea de tiempo:

```bash
npm run lab:coordination-integration -- --suspected-leader-compensation --timeline
```

## Modos

| Modo | Decisión esperada | Confianza | Qué demuestra |
|---|---|---|---|
| `pc3-ready-happy-path` | `accepted` | `high` | La acción se acepta cuando relojes, sincronización, causalidad, lease, líder y detector de fallas son consistentes. |
| `causal-conflict-review` | `requires-review` | `medium` | El timestamp y Lamport parecen razonables, pero vector clocks revelan concurrencia/conflicto causal. |
| `suspected-leader-compensation` | `compensated` | `low` | El líder está sospechado, el lease es inseguro y la salida honesta es rechazar la acción principal y compensar. |

## Campos de evidencia

Revise `evidence` en la salida estructurada:

- `integrationId`: escenario integrador para defensa PC3.
- `actors`: servicios de AURA que participan en la decisión.
- `decision` y `confidence`: resultado defendible del modo.
- `physicalTime`: skew, tolerancia y defensa del timestamp físico.
- `clockSync`: offset, delay, error estimado y confianza de sincronización.
- `lamport`: orden parcial y límite de Lamport cuando no alcanza.
- `vectorClock`: relación causal, concurrencia y conflicto detectado.
- `lease`: ownership temporal, deadline y seguridad de la acción.
- `leader`: líder actual y estabilidad.
- `failureSuspicion`: silencio observado, timeout y sospecha.
- `compensation`: acción compensatoria cuando aceptar sería inseguro.
- `risks`: riesgos que deben mencionarse en la sustentación.
- `defense`: argumentos para defender la decisión.
- `boundary`: límite académico explícito del laboratorio.

Texto de frontera obligatorio:

```text
Session 29 integrates synchronization and coordination reasoning for PC3 defense only; it does not implement consensus, quorum, Raft/Paxos, production membership, distributed transactions, or real failover.
```

## Checklist de defensa PC3

- [ ] Explicar por qué un timestamp físico dentro de tolerancia no prueba orden global.
- [ ] Justificar si offset, delay y error estimado permiten confiar en la sincronización como evidencia auxiliar.
- [ ] Usar Lamport para ordenar eventos, pero declarar cuándo es insuficiente.
- [ ] Usar vector clocks para detectar concurrencia o conflicto causal.
- [ ] Comparar la acción contra `leaseDeadline` antes de aceptar.
- [ ] Revisar si el líder está estable o sospechado por timeout.
- [ ] Si hay sospecha, lease inseguro o causalidad incompleta, rechazar o compensar antes de duplicar efectos.
- [ ] Declarar que el laboratorio no implementa consenso, quórum, Raft/Paxos, membresía productiva, transacciones distribuidas ni failover real.

## No objetivos

Quedan fuera de alcance:

- consenso distribuido;
- quórum;
- Raft, Paxos o protocolos equivalentes;
- membresía productiva;
- transacciones distribuidas;
- failover real de servicios;
- garantías productivas de disponibilidad o consistencia.

## Conclusión

La Sesión 29 entrena una defensa, no un protocolo nuevo. Una decisión distribuida se sostiene cuando el estudiante puede mostrar evidencia, reconocer límites y elegir aceptar, revisar o compensar sin inventar certezas que el sistema no tiene.
