# Laboratorio Sesión 18 — Backpressure y desacoplamiento en AURA

> Desacoplar no significa capacidad infinita. Una cola sólo mueve el problema si no mides backlog, límites y velocidad de consumo.

Esta guía valida la Sesión 18 mediante simulaciones locales y deterministas. No se agrega Kafka, RabbitMQ, NATS ni un broker real: el objetivo es que el estudiante pueda observar presión, medirla y defender mitigaciones básicas antes de sumar infraestructura.

## Objetivo del laboratorio

Demostrar que un sistema distribuido puede estar bajo presión aunque esté desacoplado.

Al finalizar, el estudiante debe poder explicar:

| Concepto | Pregunta que responde |
|---|---|
| Backlog | ¿Cuánto trabajo quedó esperando? |
| Lag | ¿Cuánto se atrasó el consumidor respecto del productor? |
| Buffer bounded | ¿Cuál es el límite explícito antes de rechazar o degradar? |
| Dropping/sampling | ¿Qué datos se pueden reducir sin romper negocio? |
| Retry | ¿Qué trabajos conviene reintentar en vez de perder? |
| Criticidad de negocio | ¿Qué eventos no se pueden descartar silenciosamente? |

## Alcance implementado

| Pieza | Decisión |
|---|---|
| Presión de streaming | `monitor-telemetria` simula productor, consumidor, buffer, drops, sampling y lag. |
| Presión de cola | `centro-logistica` agrega una cola bounded para trabajos de notificación. |
| Escenario operacional integrado | `centro-logistica` simula concierto, pedidos, planificación, fan-out, notificaciones, entregas y auditoría bajo presión. |
| Modos | Normal, saturado/controlado en labs aislados; normal, concert, overload y controlled en el lab operacional. |
| Broker real | Fuera de alcance; se mantiene simulación in-memory para foco conceptual. |
| Pruebas | `node:test` cubre métricas, saturación, sampling, retry y parsing de flags. |
| Guía | `docs/instrucciones-laboratorio-sesion-18.md`. |

## Mapa presión → flujo AURA → mitigación

| Síntoma de presión | Flujo AURA | Mitigación didáctica | Razonamiento de negocio |
|---|---|---|---|
| Productor genera más que el consumidor procesa | Telemetría de drones en concierto | Buffer bounded y medición de `buffered`, `dropped`, `lag` | Telemetría operacional puede tolerar pérdida controlada si se conserva visibilidad agregada. |
| Buffer de telemetría crece hasta el límite | `monitor-telemetria` | Sampling en modo controlado | No todo paquete tiene el mismo valor; se puede reducir frecuencia para proteger el sistema. |
| Cola de notificaciones se llena | `OrderCreated → send-order-created-notification` | Capacidad finita, rechazo visible, backlog medido | Notificaciones son importantes pero reintentables/deferibles. |
| Worker lento deja trabajos pendientes | `centro-logistica` | Métricas de cola y procesamiento por lote | Desacoplar permite continuar, pero el backlog revela deuda operativa. |
| Fallo temporal del proveedor | Notificaciones | Retry bounded | Reintentar evita perder trabajo por un timeout transitorio. |
| Evento legal/auditoría crítico | `EntregaCompletada`, auditoría legal | No descartar silenciosamente; duplicados idempotentes | Cambios legales o de estado final requieren durabilidad y tratamiento explícito. |
| Analytics degradable | Dashboard operativo | Precisión temporal por ventana bajo presión | Es mejor ver una tendencia agregada que romper flujos críticos por intentar graficar cada evento. |

## Preparación

Desde la raíz del proyecto:

```bash
node --version
npm --version
```

Si faltan dependencias:

```bash
cd services/centro-logistica
npm install
cd ../monitor-telemetria
npm install
```

## Validación rápida

Ejecutá las suites tocadas:

```bash
cd services/centro-logistica
npm test
```

Resultado esperado:

```text
29/29 tests passing
```

```bash
cd services/monitor-telemetria
npm test
```

Resultado esperado:

```text
13/13 tests passing
```

## Escenarios de laboratorio

| Escenario | Servicio | Comando principal | Resultado esperado |
|---|---|---|---|
| 1. Streaming normal | `monitor-telemetria` | `npm run lab:telemetry-pressure -- --normal` | Productor no supera al consumidor; no hay backlog final. |
| 2. Streaming saturado | `monitor-telemetria` | `npm run lab:telemetry-pressure -- --saturated` | Aparecen backlog, drops y lag. |
| 3. Streaming controlado | `monitor-telemetria` | `npm run lab:telemetry-pressure -- --controlled` | Sampling reduce carga antes de llenar el buffer. |
| 4. Cola normal | `centro-logistica` | `npm run lab:backpressure -- --normal` | La cola procesa todo sin rechazos. |
| 5. Cola saturada | `centro-logistica` | `npm run lab:backpressure -- --saturated` | La capacidad finita produce rechazos visibles y backlog. |
| 6. Cola controlada | `centro-logistica` | `npm run lab:backpressure -- --controlled` | Se reduce tasa, se reintenta una notificación y no queda backlog. |
| 7. Operación integrada normal | `centro-logistica` | `npm run lab:operational-pressure -- --normal` | El sistema conserva eventos críticos y no acumula backlog. |
| 8. Operación integrada concierto | `centro-logistica` | `npm run lab:operational-pressure -- --concert` | Aparecen lag, backlog de telemetría y cola de notificaciones. |
| 9. Operación integrada overload | `centro-logistica` | `npm run lab:operational-pressure -- --overload` | Se descarta/rechaza trabajo no crítico; auditoría y entregas siguen preservadas. |
| 10. Operación integrada controlada | `centro-logistica` | `npm run lab:operational-pressure -- --controlled` | Sampling, reducción de tasa y retry estabilizan el sistema sin perder eventos críticos. |

## Escenario 1 — Streaming normal

### Situación

Los drones producen telemetría a una tasa menor que la capacidad del consumidor. El sistema puede absorber el flujo sin acumular presión.

### Ejecución

```bash
cd services/monitor-telemetria
npm run lab:telemetry-pressure -- --normal
```

### Resultado esperado

```text
Telemetry pressure lab: normal
Strategy: buffer
Produced: 10
Accepted into buffer: 10
Processed: 10
Buffered backlog: 0
Dropped: 0
Sampled out: 0
Lag: 0
```

### Interpretación

El consumidor procesa más rápido de lo que entra. Hay desacoplamiento por buffer, pero no aparece deuda acumulada.

### Pregunta clave

¿Qué métrica confirma que el sistema no quedó atrasado?

Respuesta esperada:

> `Buffered backlog` y `Lag` terminan en cero. No alcanza con mirar cuántos paquetes se produjeron.

## Escenario 2 — Streaming saturado

### Situación

Durante un concierto, muchos drones reportan al mismo tiempo. El productor genera más paquetes por tick que la capacidad del consumidor.

### Ejecución

```bash
cd services/monitor-telemetria
npm run lab:telemetry-pressure -- --saturated
```

### Resultado esperado

```text
Telemetry pressure lab: saturated
Strategy: buffer
Produced: 30
Accepted into buffer: 16
Processed: 10
Buffered backlog: 6
Peak buffered: 8
Dropped: 14
Lag: 6
```

### Interpretación

El buffer no crea capacidad infinita. Sólo permite absorber una parte del pico. Cuando llega al límite, el sistema debe tomar una decisión visible: descartar, rechazar, degradar o reducir la tasa.

### Pregunta clave

¿Por qué `Produced: 30` no significa que el sistema procesó 30 paquetes?

Respuesta esperada:

> Porque producir no es consumir. Si la capacidad del consumidor es menor, aparece backlog, lag y eventualmente drops.

## Escenario 3 — Streaming controlado con sampling

### Situación

La telemetría no siempre necesita cada paquete individual. Para proteger el sistema, AURA conserva una muestra y descarta paquetes intermedios de forma explícita.

### Ejecución

```bash
cd services/monitor-telemetria
npm run lab:telemetry-pressure -- --controlled
```

### Resultado esperado

```text
Telemetry pressure lab: controlled
Strategy: sample
Produced: 30
Accepted into buffer: 10
Processed: 10
Buffered backlog: 0
Dropped: 0
Sampled out: 20
Lag: 0
```

### Interpretación

Sampling no es “perder datos por accidente”. Es una política explícita para datos de menor criticidad cuando preservar la salud del sistema vale más que procesar cada muestra.

### Pregunta clave

¿Por qué sampling puede ser aceptable para telemetría pero no para `EntregaCompletada`?

Respuesta esperada:

> Porque telemetría es observacional y de alta frecuencia; `EntregaCompletada` cambia estado de negocio y puede tener impacto legal u operativo.

## Escenario 4 — Cola normal

### Situación

Las notificaciones de órdenes llegan a una cola con capacidad suficiente. El worker puede procesar todo el lote.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:backpressure -- --normal
```

### Resultado esperado

```text
Queue pressure lab: normal
Incoming jobs: 4
Queued accepted: 4
Deferred by rate reduction: 0
Rejected at capacity: 0
Processed: 4
Retries queued: 0
Backlog: 0
```

### Interpretación

La cola desacopla el trabajo lento sin acumular deuda. Este es el caso sano: capacidad, producción y consumo están balanceados.

### Pregunta clave

¿Qué demuestra que la cola no quedó escondiendo un problema?

Respuesta esperada:

> `Backlog: 0`, `Rejected at capacity: 0` y `Processed` igual a los trabajos aceptados.

## Escenario 5 — Cola saturada con worker lento

### Situación

Llegan diez notificaciones, la cola sólo acepta cuatro y el worker procesa dos en esta ventana. El resto no puede desaparecer silenciosamente.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:backpressure -- --saturated
```

### Resultado esperado

```text
Queue pressure lab: saturated
Incoming jobs: 10
Queued accepted: 4
Deferred by rate reduction: 0
Rejected at capacity: 6
Processed: 2
Backlog: 2
```

### Interpretación

El límite de cola hace visible la presión. Sin límite, el sistema podría consumir memoria hasta fallar peor y más tarde.

### Pregunta clave

¿La cola resolvió la saturación o sólo la movió?

Respuesta esperada:

> Sólo la movió y la hizo medible. Si el worker sigue siendo más lento que el productor, el backlog crece o empiezan los rechazos.

## Escenario 6 — Cola controlada con reducción de tasa y retry

### Situación

Para notificaciones, AURA puede diferir parte del trabajo y reintentar fallos temporales. El lab acepta uno de cada dos trabajos y simula un timeout inicial del proveedor.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:backpressure -- --controlled
```

### Resultado esperado

```text
Queue pressure lab: controlled
Incoming jobs: 10
Queued accepted: 5
Deferred by rate reduction: 5
Rejected at capacity: 0
Processed: 5
Retries queued: 1
Backlog: 0
```

### Interpretación

La mitigación combina dos decisiones:

- reducir tasa de entrada para trabajo reintenable;
- reintentar un fallo temporal sin bloquear el flujo principal.

En el lab, el retry se procesa inmediatamente en una segunda pasada del worker para que el resultado sea determinista y rápido de validar en clase. Conceptualmente representa un ciclo posterior de procesamiento: el trabajo no desaparece, vuelve a quedar disponible hasta que un worker pueda resolverlo o agote intentos.

La parte importante es que la política depende del negocio. Notificaciones pueden esperar; auditoría legal y eventos de entrega no deberían descartarse silenciosamente.

### Pregunta clave

¿Qué error conceptual sería grave en este escenario?

Respuesta esperada:

> Aplicar la misma política de descarte a todos los eventos. La criticidad de negocio define si se puede samplear, diferir, reintentar o exigir durabilidad fuerte.

## Escenario 7 — Operación integrada normal

### Situación

AURA opera en condiciones normales: los drones emiten telemetría, operadores crean pedidos, el planificador responde, `OrderCreated` se fan-outea a notificaciones, auditoría y dashboard, y llegan eventos `EntregaCompletada`.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --normal
```

### Resultado esperado

```text
Operational pressure lab: normal
Telemetry:
- produced=8 accepted=8 processed=8 buffered/backlog=0 dropped=0 sampledOut=0 lag=0
Orders:
- requested=8 planned=8 rejected/failed=0 deferred=0
Notifications queue:
- enqueued=8 processed=8 backlog=0 rejected=0 retried=0 deferred=0
Delivery events:
- received=4 processed=4 duplicatesIgnored=0 rejected=0 criticalDropped=0
Audit:
- written=12 dropped=0
```

### Interpretación

Este es el control del experimento. No basta con que “funcione”: el estudiante debe mirar que `lag`, `backlog`, `dropped`, `rejected` y `criticalDropped` terminen en cero.

### Pregunta clave

¿Por qué este escenario es necesario antes de probar presión?

Respuesta esperada:

> Porque permite comparar contra una línea base sana. Sin baseline, no sabés si el backlog aparece por presión real o por un bug del laboratorio.

## Escenario 8 — Operación integrada durante concierto

### Situación

Hay un evento masivo. Muchos drones reportan al mismo tiempo, los operadores cargan pedidos y la cola de notificaciones empieza a atrasarse. El sistema sigue preservando auditoría y entregas, pero la presión ya es visible.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --concert
```

### Resultado esperado

```text
Operational pressure lab: concert
Telemetry:
- produced=35 accepted=35 processed=15 buffered/backlog=20 dropped=0 sampledOut=0 lag=20
Orders:
- requested=20 planned=15 rejected/failed=5 deferred=0
Notifications queue:
- enqueued=15 processed=10 backlog=5 rejected=0 retried=0 deferred=0
Delivery events:
- received=11 processed=10 duplicatesIgnored=1 rejected=0 criticalDropped=0
Audit:
- written=26 dropped=0
```

### Interpretación

El sistema desacoplado no colapsa inmediatamente, pero el atraso queda expuesto. `Telemetry lag: 20` y `Notifications backlog: 5` muestran deuda operativa. El duplicado de entrega se ignora idempotentemente, no se reaplica.

### Pregunta clave

¿Qué demuestra que desacoplar no elimina la presión?

Respuesta esperada:

> Que aunque los productores pueden seguir publicando, los consumidores lentos acumulan lag y backlog. La cola sólo cambia dónde se ve el problema.

## Escenario 9 — Operación integrada en overload

### Situación

La presión supera límites. El buffer de telemetría se llena, el planificador no alcanza para todos los pedidos y la cola bounded de notificaciones empieza a rechazar trabajo no crítico.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --overload
```

### Resultado esperado

```text
Operational pressure lab: overload
Telemetry:
- produced=50 accepted=18 processed=10 buffered/backlog=8 dropped=32 sampledOut=0 lag=8
Orders:
- requested=30 planned=10 rejected/failed=20 deferred=0
Notifications queue:
- enqueued=9 processed=5 backlog=4 rejected=1 retried=0 deferred=0
Delivery events:
- received=12 processed=10 duplicatesIgnored=2 rejected=0 criticalDropped=0
Audit:
- written=22 dropped=0
```

### Interpretación

Acá aparece la diferencia entre tipos de datos. Telemetría y notificaciones pueden degradarse o rechazarse con métricas explícitas. Auditoría y `EntregaCompletada` no se descartan silenciosamente: `criticalDropped=0` y `Audit dropped=0` son invariantes simuladas del laboratorio. No representan durabilidad productiva; representan la política que luego debería implementarse con almacenamiento o broker durable.

### Pregunta clave

¿Cuál sería el error grave de diseño en overload?

Respuesta esperada:

> Usar la misma política para todo. Si descartás auditoría o entregas como si fueran telemetría, rompés trazabilidad legal y estado de negocio.

## Escenario 10 — Operación integrada controlada

### Situación

AURA aplica políticas explícitas: sampling de telemetría, reducción de tasa para pedidos/notificaciones, retry bounded del primer fallo temporal y precisión temporal degradada para dashboard/analytics.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --controlled
```

### Resultado esperado

```text
Operational pressure lab: controlled
Telemetry:
- produced=50 accepted=17 processed=15 buffered/backlog=2 dropped=0 sampledOut=33 lag=2
Orders:
- requested=30 planned=15 rejected/failed=0 deferred=15
Notifications queue:
- enqueued=15 processed=15 backlog=0 rejected=0 retried=1 deferred=15
Delivery events:
- received=12 processed=10 duplicatesIgnored=2 rejected=0 criticalDropped=0
Audit:
- written=27 dropped=0
```

### Interpretación

El modo controlado no “procesa todo”. Esa no es la meta. La meta es estabilizar el sistema con decisiones defendibles: se samplea telemetría, se difiere trabajo reintenable, se baja precisión del dashboard y se preservan eventos críticos.

### Pregunta clave

¿Por qué `sampledOut=33` no es automáticamente un bug?

Respuesta esperada:

> Porque es una política explícita para telemetría de alta frecuencia. El bug sería ocultarlo o aplicarlo a eventos críticos.

## Lectura integrada de métricas

| Concepto | Cómo se valida en el lab operacional | Métrica observable | Política de negocio |
|---|---|---|---|
| Backpressure | Productores generan más de lo que consumidores procesan por tick. | `Telemetry lag`, `Notifications backlog`, timeline por tick. | Medir antes de escalar o cambiar infraestructura. |
| Buffer bounded | Telemetría y notificaciones tienen capacidad finita. | `buffered/backlog`, `Peak buffered`, `rejected`. | Evitar crecimiento infinito de memoria y hacer presión visible. |
| Dropping/sampling | Modo `controlled` samplea telemetría antes de llenar buffer. | `sampledOut`, `dropped`. | Telemetría puede perder granularidad si se conserva visibilidad agregada. |
| Retry/defer | Notificaciones se reintentan o difieren. | `retried`, `deferred`, `Notifications backlog`. | Notificaciones son importantes, pero no deben bloquear eventos críticos. |
| Idempotencia | Duplicados de `EntregaCompletada` se ignoran. | `duplicatesIgnored`, `processed`. | Un hecho de entrega no debe reaplicar efectos de negocio. |
| Auditoría legal | Cada pedido planificado y entrega recibida escribe auditoría. | `Audit written`, `Audit dropped=0`. | Trazabilidad legal no se descarta silenciosamente. |
| Degradación de analytics | Dashboard cambia precisión temporal bajo presión. | `temporalPrecision`, `degraded=true`. | Mejor precisión agregada que romper flujos críticos. |

## Checklist de validación

- [ ] `services/centro-logistica` ejecuta `npm test` correctamente.
- [ ] `services/monitor-telemetria` ejecuta `npm test` correctamente.
- [ ] `npm run lab:operational-pressure -- --normal` no acumula backlog ni drops críticos.
- [ ] `npm run lab:operational-pressure -- --concert` muestra lag/backlog medible.
- [ ] `npm run lab:operational-pressure -- --overload` rechaza o degrada sólo flujos no críticos.
- [ ] `npm run lab:operational-pressure -- --controlled` reduce drops/backlog con sampling, defer y retry.
- [ ] El estudiante puede explicar la diferencia entre producir, aceptar en buffer y procesar.
- [ ] El estudiante puede identificar backlog y lag en la salida del lab.
- [ ] El estudiante puede justificar sampling para telemetría.
- [ ] El estudiante puede justificar retry/defer para notificaciones.
- [ ] El estudiante puede explicar por qué `EntregaCompletada` y auditoría legal no deben descartarse silenciosamente.

## Archivos clave

| Archivo | Rol |
|---|---|
| `services/monitor-telemetria/src/telemetry-stream-simulator.js` | Simulación de telemetría y presión de streaming. |
| `services/monitor-telemetria/src/telemetry-pressure-lab.js` | CLI del laboratorio de presión de telemetría. |
| `services/monitor-telemetria/test/telemetry-stream-simulator.test.js` | Pruebas de planes, saturación y sampling. |
| `services/centro-logistica/src/lab-work-queue.js` | Cola FIFO Session 17 y cola bounded Session 18. |
| `services/centro-logistica/src/backpressure-lab.js` | CLI del laboratorio de cola bounded/backpressure. |
| `services/centro-logistica/src/operational-pressure-lab.js` | Simulación integrada de presión operacional AURA. |
| `services/centro-logistica/test/lab-work-queue.test.js` | Pruebas de cola FIFO, bounded queue y retry. |
| `services/centro-logistica/test/backpressure-lab.test.js` | Pruebas de escenarios normal, saturado y controlado. |
| `services/centro-logistica/test/operational-pressure-lab.test.js` | Pruebas del laboratorio integrado normal, concert, overload y controlled. |

## Problemas comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Dropped` aparece en modo saturado | El buffer llegó a capacidad máxima. | Revisar `Peak buffered`, `Buffered backlog` y capacidad del consumidor. |
| `Backlog` queda mayor a cero | El worker procesó menos que lo aceptado. | Aumentar capacidad de worker, reducir tasa o escalar consumidores. |
| Se interpreta sampling como bug | Falta distinguir pérdida accidental de política explícita. | Revisar `Strategy: sample` y `Sampled out`. |
| La cola parece “resolver todo” | No se están mirando métricas de profundidad/rechazo. | Revisar `Rejected at capacity`, `Backlog` y `Retries queued`. |
| Se quiere descartar auditoría legal | Se está aplicando una política de telemetría a un evento crítico. | Separar criticidad de negocio antes de elegir mitigación. |
| `criticalDropped` es mayor a cero | Se aplicó una política de descarte a un evento crítico. | Corregir el flujo: rechazar explícitamente, reintentar o preservar, pero no descartar en silencio. |

## Cierre conceptual

Una cola, un stream o un buffer no eliminan presión. Sólo cambian dónde aparece. La ingeniería correcta no es “poner una cola”; es medir producción, consumo, backlog, límites y decidir qué degradación acepta el negocio.
