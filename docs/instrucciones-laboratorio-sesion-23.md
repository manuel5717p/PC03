# Laboratorio Sesión 23 - Lamport clocks y orden parcial

> Resultado esperado: el estudiante puede explicar cómo un reloj lógico de Lamport preserva relaciones `happened-before`, por qué eventos concurrentes no quedan causalmente ordenados y qué significa usar un desempate determinístico para visualización.

La Sesión 23 continúa las Sesiones 21 y 22. Primero se observaron límites del tiempo físico; luego se estudió sincronización de relojes. Ahora se introduce una herramienta lógica: en lugar de preguntar “¿qué hora marcaba el nodo?”, preguntamos “¿qué eventos pudieron influirse por programa local o por mensajes?”.

## Relación con las sesiones previas

| Sesión | Pregunta central | Resultado |
|---|---|---|
| 21 | ¿Qué sale mal si confío ciegamente en timestamps físicos? | Se observan skew, drift, wall-clock jumps y tolerancia. |
| 22 | ¿Qué mejora la sincronización de relojes? | Se estima offset/delay y se reconoce que NTP no prueba causalidad. |
| 23 | ¿Cómo razono sobre orden parcial sin depender de la hora física? | Se usan Lamport clocks para modelar `happened-before`. |
| 24 | ¿Cómo detecto concurrencia con más precisión? | Se estudiarán vector clocks. |

## Conceptos clave

| Concepto | Definición operativa |
|---|---|
| Lamport clock | Contador lógico local que aumenta en cada evento relevante. |
| Evento local | Acción interna de un nodo; incrementa el contador local. |
| Send | Envío de mensaje; incrementa el contador y adjunta `messageClock`. |
| Receive | Recepción de mensaje; actualiza con `max(localCounter, messageClock) + 1`. |
| `happened-before` | Relación de orden parcial por programa local o envío/recepción de mensajes. |
| Concurrencia | Dos eventos sin relación `happened-before`; ninguno causó al otro según la evidencia disponible. |
| Desempate determinístico | Regla estable para presentar eventos con igual contador, por ejemplo `nodeId`; no prueba causalidad. |

## Preparación

Desde la raíz del proyecto:

```bash
cd services/monitor-telemetria
npm install
```

Validación rápida:

```bash
npm test
```

## Comandos del laboratorio

| Escenario | Comando | Qué observar |
|---|---|---|
| Cadena causal | `npm run lab:lamport-ordering -- --causal-chain` | Los contadores crecen siguiendo programa local y send/receive. |
| Eventos concurrentes | `npm run lab:lamport-ordering -- --concurrent-events` | Eventos independientes pueden empatar y no tienen relación causal. |
| Merge y desempate | `npm run lab:lamport-ordering -- --merge-and-tie-break` | Recepción con `max(local, messageClock) + 1` y orden estable por `nodeId`. |

También se aceptan alias posicionales:

```bash
npm run lab:lamport-ordering -- concurrent-events
npm run lab:lamport-ordering -- merge-and-tie-break
```

Para inspeccionar la estructura completa:

```bash
npm run lab:lamport-ordering -- --causal-chain --json
npm run lab:lamport-ordering -- --causal-chain --timeline
```

## Escenario 1 - Cadena causal

### Ejecución

```bash
npm run lab:lamport-ordering -- --causal-chain
```

### Resultado esperado

La salida muestra una cadena de eventos entre `centro-logistica`, `gestor-flota` y `monitor-telemetria`. Cada evento posterior en la cadena causal tiene un contador mayor.

### Interpretación

Si un evento A ocurre antes que un evento B por programa local o por envío/recepción de mensajes, entonces `L(A) < L(B)`. Esta afirmación sí es útil. Pero la inversa no alcanza: que `L(A) < L(B)` no prueba por sí solo que A causó B.

## Escenario 2 - Eventos concurrentes

### Ejecución

```bash
npm run lab:lamport-ordering -- --concurrent-events
```

### Resultado esperado

Los nodos generan eventos locales independientes. Como no hay mensajes compartidos, el laboratorio reporta pares concurrentes.

### Interpretación

El sistema puede ordenar esos eventos para mostrar una tabla o un log estable, pero ese orden es una decisión de presentación. No debe convertirse en una afirmación de causalidad.

## Escenario 3 - Merge y desempate determinístico

### Ejecución

```bash
npm run lab:lamport-ordering -- --merge-and-tie-break
```

### Resultado esperado

El receptor actualiza su contador con `max(localCounter, messageClock) + 1`. Cuando dos eventos empatan en contador, la vista usa `nodeId` como desempate estable.

### Interpretación

El merge evita retroceder el reloj lógico al recibir mensajes. El desempate por `nodeId` permite reproducibilidad, pero no agrega evidencia causal. Este límite prepara la Sesión 24: vector clocks.

## Visualización en la plataforma de observabilidad

```bash
cd services/observability-platform
npm start
```

Abre `http://localhost:8010`, selecciona **Sesión 23 — Lamport clocks y orden parcial** y ejecuta los modos disponibles. La plataforma expone resumen, observaciones, decisiones, métricas, línea de tiempo, contrato de aprendizaje y JSON crudo.

## Preguntas para responder

1. ¿Qué regla aplica un nodo cuando recibe un mensaje con contador Lamport?
2. ¿Por qué `L(A) < L(B)` no alcanza para afirmar que A causó B?
3. ¿Qué evidencia falta en el escenario de eventos concurrentes?
4. ¿Para qué sirve el desempate por `nodeId` y qué NO demuestra?
5. ¿Por qué esta sesión prepara vector clocks sin implementarlos todavía?

## Advertencias que deben quedar claras

- Lamport clocks ayudan a razonar sobre orden parcial, no sobre hora real.
- El contador lógico no mide duración, latencia ni freshness operacional.
- Un orden total para UI/logs puede ser arbitrario.
- El desempate determinístico no transforma concurrencia en causalidad.
- La detección más precisa de concurrencia queda para la Sesión 24 con vector clocks.

## Cierre

La Sesión 23 consolida el bloque inicial de Unidad 3: tiempo físico, sincronización y orden parcial. A partir de aquí el estudiante puede explicar por qué la hora física no alcanza, qué aporta sincronizar relojes y cómo Lamport permite razonar sobre `happened-before` sin venderlo como una solución completa de causalidad.
