# Sesión 25 — Exclusión mutua distribuida y sección crítica

## Objetivo

Estudiar cómo varios nodos de AURA coordinan el acceso a un recurso compartido sin permitir que dos entren simultáneamente a la misma sección crítica.

El laboratorio usa una simulación determinística sobre `aura-dispatch-window`. La regla de cola es deliberadamente simple y defendible:

```text
orden de request = logicalTimestamp ascendente, luego nodeId ascendente
propiedad mínima = cero ventanas de sección crítica solapadas
ciclo visible = request -> wait/queued -> grant -> enter-critical-section -> release/exit
```

## Alcance

Esta sesión cubre exclusión mutua y sección crítica mediante un arbitraje determinístico simplificado. No cubre leases, expiración de locks, fencing tokens, elección de líder ni recuperación de ownership. Esos riesgos aparecen explícitamente en la Sesión 26 y posteriores.

## Ciclo que debe defender

El laboratorio hace visible el ciclo mínimo de exclusión mutua:

1. `request`: un nodo solicita entrar al recurso compartido `aura-dispatch-window`.
2. `wait/queued`: si no está primero, espera detrás de requests anteriores según `logicalTimestamp` y `nodeId`.
3. `grant`: el arbitraje determinístico simplificado concede entrada solo al request que está en la cabeza de la cola.
4. `enter-critical-section`: el nodo entra únicamente después del `grant`.
5. `release/exit`: el nodo sale y libera la sección crítica; ese release habilita evaluar el siguiente request de la cola.

Preguntas obligatorias de defensa:

- ¿Quién espera? Los requests que no están en la cabeza de la cola estable.
- ¿Quién concede? El arbitraje determinístico simplificado del laboratorio, reconstruible por todos los nodos con la misma metadata lógica.
- ¿Cuándo entra un nodo? Cuando su request queda primero y recibe `grant`; en la evidencia aparece como `enterAtTick`.
- ¿Qué hace posible `release`? Permite evaluar y conceder el siguiente request sin solapar ventanas.
- ¿Por qué se mantiene safety? Porque cada entrada requiere `grant` previo y cada ventana termina antes de la siguiente entrada al mismo recurso.

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:mutual-exclusion -- --contended-queue
npm run lab:mutual-exclusion -- --fairness-rounds
npm run lab:mutual-exclusion -- --critical-section-safety
npm run lab:mutual-exclusion -- --delay-and-reorder
```

Salida JSON para inspección o automatización:

```bash
npm run lab:mutual-exclusion -- --delay-and-reorder --json
```

Línea de tiempo:

```bash
npm run lab:mutual-exclusion -- --critical-section-safety --timeline
```

## Modos

| Modo | Qué demuestra | Pregunta de defensa |
|---|---|---|
| `contended-queue` | Requests concurrentes y desempate estable por `nodeId`. | ¿Por qué el orden de cola no depende del orden de llegada? |
| `fairness-rounds` | Rondas repetidas sin prioridad permanente de un nodo. | ¿Qué evidencia muestra que todos entran antes de repetir indefinidamente? |
| `critical-section-safety` | Ventanas de entrada/salida sin solapamiento. | ¿Dónde se prueba que no hay dos nodos dentro al mismo tiempo? |
| `delay-and-reorder` | Mensajes entregados fuera de orden, pero cola lógica estable. | ¿Por qué reordenar entregas no rompe safety? |

## Cómo leer la evidencia

Revise estos campos en la salida estructurada:

- `metrics.safetyViolations`: debe ser `0`.
- `evidence.orderingRule`: debe indicar `logicalTimestamp asc, then nodeId asc`.
- `evidence.lifecycleModel`: debe mostrar `request -> wait/queued -> grant -> enter-critical-section -> release/exit`.
- `evidence.lifecycleAnswers.whoWaits`: identifica qué nodos esperan y detrás de qué request.
- `evidence.lifecycleAnswers.whoGrants`: identifica el arbitraje determinístico simplificado que concede entrada.
- `evidence.lifecycleAnswers.whenEnter`: muestra en qué tick entra cada request concedido.
- `evidence.lifecycleAnswers.releaseEnables`: muestra qué request queda habilitado por cada release.
- `evidence.lifecycleAnswers.whySafetyHolds`: resume la defensa de safety.
- `evidence.queue`: muestra la posición final de cada request.
- `evidence.criticalSectionWindows`: permite comprobar que cada entrada termina antes de la siguiente.
- `timeline`: separa request, wait/queued, grant, enter-critical-section, release y delivery cuando el modo lo incluye.

## Relación con sesiones anteriores

- La Sesión 21 mostró que el tiempo físico no prueba orden global perfecto.
- La Sesión 22 explicó por qué sincronizar relojes reduce incertidumbre, pero no elimina causalidad distribuida.
- La Sesión 23 introdujo Lamport clocks para ordenar eventos con relojes lógicos.
- La Sesión 24 distinguió causalidad y concurrencia con vector clocks.
- La Sesión 25 usa esa base para arbitrar entrada a un recurso compartido.

## Checklist de aprendizaje

- [ ] Identificar el recurso compartido y la sección crítica.
- [ ] Narrar el ciclo `request -> wait/queued -> grant -> enter-critical-section -> release/exit`.
- [ ] Responder quién espera, quién concede, cuándo entra el nodo y qué habilita cada release.
- [ ] Ordenar manualmente la cola por `logicalTimestamp` y `nodeId`.
- [ ] Verificar que `safetyViolations` es `0`.
- [ ] Explicar por qué una cola estable no es lo mismo que un lease distribuido.
- [ ] Defender qué queda fuera de alcance hasta la Sesión 26.

## Conclusión

La exclusión mutua distribuida empieza con una garantía básica: **a lo sumo un nodo entra a la sección crítica del mismo recurso al mismo tiempo**. Todo lo demás —leases, expiración, fencing y liderazgo— agrega manejo de fallas, pero no reemplaza esta propiedad mínima.
