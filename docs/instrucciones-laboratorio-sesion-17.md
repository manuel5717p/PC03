# Laboratorio Sesión 17 — Request/response, pub/sub, colas y streaming en AURA

> No toda comunicación distribuida debe implementarse igual. El patrón correcto depende de la latencia esperada, el nivel de acoplamiento aceptable, la resiliencia requerida y la naturaleza del evento de negocio.

Esta guía valida la Sesión 17 mediante escenarios ejecutables de AURA. El caso base es una operación durante un concierto masivo: hay drones enviando telemetría, operadores creando órdenes, planificación de rutas, notificaciones, auditoría legal y dashboards en tiempo real.

No se introduce Kafka, RabbitMQ ni NATS todavía. Las piezas nuevas de pub/sub y cola son **simulaciones locales e in-memory** para que el estudiante entienda el criterio antes de sumar infraestructura.

## Objetivo del laboratorio

Demostrar y defender cuándo usar:

| Patrón | Pregunta que responde |
|---|---|
| Request/response | ¿Necesito una respuesta inmediata para continuar el flujo? |
| Pub/sub | ¿Un hecho de negocio debe ser observado por varios consumidores independientes? |
| Cola | ¿Necesito absorber picos o procesar trabajo lento fuera del flujo principal? |
| Streaming | ¿Estoy enviando datos continuos de alta frecuencia? |

Al finalizar, el estudiante debe poder justificar la elección según:

- latencia;
- desacoplamiento;
- resiliencia;
- naturaleza del negocio.

## Alcance implementado

| Pieza | Decisión |
|---|---|
| Request/response | Se reutiliza el flujo `centro-logistica → planificador-rutas` al crear una orden. |
| Pub/sub | Se publica `OrderCreated` en `orders.created.v1` y se distribuye a tres consumidores. |
| Cola FIFO | Las notificaciones se encolan como trabajos `send-order-created-notification`. |
| Streaming | Se agrega simulador de telemetría normal y modo concierto/burst. |
| Transporte pub/sub y cola | In-memory para laboratorio, sin broker real todavía. |
| Servicio principal del lab | `services/centro-logistica`. |
| Servicio de streaming | `services/monitor-telemetria`. |
| Guía | `docs/instrucciones-laboratorio-sesion-17.md`. |

## Mapa de patrones

| Patrón | Flujo AURA | Por qué encaja |
|---|---|---|
| Request/response | `centro-logistica → planificador-rutas` al crear una orden | La orden necesita saber si existe una ruta antes de persistir; importa la respuesta inmediata y el control de fallas. |
| Pub/sub | `OrderCreated` publicado para notificaciones, auditoría legal y dashboard | Es un hecho de negocio que puede interesar a varios consumidores independientes; el emisor no debe conocerlos. |
| Cola FIFO | Envío de notificaciones de órdenes creadas | Es trabajo lento/no crítico; una cola absorbe picos y procesa secuencialmente con métricas claras. |
| Streaming | Telemetría de drones en concierto masivo | Hay muchos eventos continuos; importa enviar flujo sostenido con baja latencia más que pedir/responder por cada packet. |

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
17/17 tests passing
```

```bash
cd services/monitor-telemetria
npm test
```

Resultado esperado:

```text
8/8 tests passing
```

## Escenarios de laboratorio

| Escenario | Patrón | Comando principal | Resultado esperado |
|---|---|---|---|
| 1. Crear orden y planificar ruta | Request/response | `node --test test/api.test.js` | La orden sólo se confirma si hay respuesta válida del planificador. |
| 2. Publicar `OrderCreated` | Pub/sub | `npm run lab:communication-patterns -- --orders=5` | Cada orden se publica una vez y llega a tres consumidores. |
| 3. Encolar notificaciones | Cola FIFO | `npm run lab:communication-patterns -- --orders=8` | Los trabajos se procesan secuencialmente y las métricas cierran. |
| 4. Retry de trabajo lento/fallido | Cola + resiliencia | `npm run lab:communication-patterns -- --orders=3 --fail-first-notification` | El primer trabajo falla, vuelve a cola y luego se procesa. |
| 5. Telemetría normal | Streaming | `npm run lab:telemetry-stream -- --normal --count=3 --interval-ms=0` | Se simula un flujo pequeño de paquetes. |
| 6. Concierto masivo | Streaming | `npm run lab:telemetry-stream -- --concert --count=100 --skip-delay` | Se simula una ráfaga de telemetría. |

## Escenario 1 — Request/response para crear orden y planificar ruta

### Situación

Un operador crea una orden. Antes de confirmar el estado local, `centro-logistica` necesita saber si `planificador-rutas` puede devolver una ruta válida.

### Ejecución

```bash
cd services/centro-logistica
node --test test/api.test.js
```

### Resultado esperado

En la salida de tests debe aparecer el caso de creación y listado de órdenes. El comportamiento esperado es:

```text
crea orden y la lista
route_planner_attempts: 1
route_plan.total_stops: 1
```

### Interpretación

Este flujo **no** es un evento “fire-and-forget”. La respuesta del planificador condiciona la decisión de negocio:

- si hay ruta, la orden puede confirmarse;
- si el planificador falla, responde lento o rechaza la zona, el flujo debe fallar de forma controlada;
- la latencia importa porque el operador espera una respuesta.

### Pregunta clave

¿Por qué no publicar `OrderRequested` y responder inmediatamente al operador?

Respuesta esperada:

> Porque en este punto la planificación de ruta forma parte de la confirmación de la orden. Si se confirma sin ruta, el sistema podría dejar un estado parcial difícil de explicar al operador.

## Escenario 2 — Pub/sub: un hecho, varios consumidores

### Situación

Cuando se crea una orden, AURA produce un hecho de negocio: `OrderCreated`. Ese hecho interesa a varios consumidores:

- notificaciones;
- auditoría legal;
- dashboard/analítica operacional.

El publicador no debería conocer ni llamar directamente a cada consumidor.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:communication-patterns -- --orders=5
```

### Resultado esperado

```text
Scenario: order-created-pubsub-and-queue
Business fact: OrderCreated is one business fact published once per order.
Independent consumers: notifications, legal audit, dashboard analytics

Pub/Sub fan-out:
- order-created-001: 3 subscribers
- order-created-002: 3 subscribers
- order-created-003: 3 subscribers
- order-created-004: 3 subscribers
- order-created-005: 3 subscribers
```

También deben aparecer métricas similares a:

```text
Bus metrics: {"published":5,"deliveries":15,"topics":[...]}
Audit entries: 5
Dashboard totalOrders: 5
```

### Interpretación

Cada orden se publica una sola vez, pero el bus la entrega a tres consumidores. Esto permite agregar o quitar consumidores sin cambiar el publicador.

La diferencia conceptual es clave:

| Sin pub/sub | Con pub/sub |
|---|---|
| `centro-logistica` llama directamente a notificaciones, auditoría y dashboard. | `centro-logistica` publica `OrderCreated`. |
| El emisor conoce todos los consumidores. | El emisor sólo conoce el tópico. |
| Agregar un consumidor modifica el flujo principal. | Agregar un consumidor se hace suscribiéndolo al tópico. |

### Nota técnica

Este bus es una simulación in-memory de laboratorio. Demuestra fan-out e independencia lógica entre consumidores, pero no reemplaza un broker real ni garantiza desacoplamiento temporal completo ante consumidores lentos.

### Pregunta clave

¿Por qué `OrderCreated` sí es buen candidato a pub/sub?

Respuesta esperada:

> Porque es un hecho de negocio ya ocurrido. Varios consumidores pueden reaccionar sin que el productor necesite esperar ni conocer el detalle de cada reacción.

## Escenario 3 — Cola FIFO para absorber picos

### Situación

Durante el concierto aparecen picos de órdenes. Enviar notificaciones puede ser lento o depender de un proveedor externo. No conviene bloquear auditoría, dashboard ni el flujo principal por ese trabajo.

En este lab, el consumidor de notificaciones no envía inmediatamente. Encola trabajos `send-order-created-notification` y un worker los procesa de forma secuencial.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:communication-patterns -- --orders=8
```

### Resultado esperado

```text
Queue processing:
- #1: processed work-001
- #2: processed work-002
- #3: processed work-003
- #4: processed work-004
- #5: processed work-005
- #6: processed work-006
- #7: processed work-007
- #8: processed work-008
```

Métricas esperadas:

```text
Queue metrics: {"queued":0,"processed":8,"failed":0,"maxAttempts":2}
```

### Interpretación

La cola desacopla el pico de órdenes del proveedor de notificaciones:

- el evento `OrderCreated` puede ser observado por todos;
- el trabajo lento queda en cola;
- el worker procesa a su ritmo;
- las métricas permiten saber si quedó backlog.

### Diferencia entre pub/sub y cola

| Pregunta | Pub/sub | Cola |
|---|---|---|
| ¿Qué distribuye? | Un hecho de negocio. | Un trabajo pendiente. |
| ¿Quién lo recibe? | Varios consumidores pueden recibir el mismo evento. | Un worker procesa cada trabajo. |
| ¿Para qué sirve? | Fan-out y bajo acoplamiento. | Absorber picos, retry y procesamiento diferido. |

### Pregunta clave

Si `OrderCreated` ya llegó al consumidor de notificaciones, ¿por qué crear una cola?

Respuesta esperada:

> Porque recibir el evento no significa que el trabajo lento de enviar la notificación deba ejecutarse dentro del mismo flujo. La cola permite diferirlo, reintentarlo y medirlo.

## Escenario 4 — Retry de un trabajo fallido

### Situación

El primer intento de notificación falla por un timeout simulado del proveedor. La cola debe reencolar el trabajo mientras no supere el máximo de intentos.

### Ejecución

```bash
cd services/centro-logistica
npm run lab:communication-patterns -- --orders=3 --fail-first-notification
```

### Resultado esperado

```text
Queue processing:
- #1: retry_queued work-001
- #2: processed work-002
- #3: processed work-003
- #4: processed work-001
```

Métricas esperadas:

```text
Queue metrics: {"queued":0,"processed":3,"failed":0,"maxAttempts":2}
```

### Interpretación

El fallo inicial no pierde el trabajo. La cola lo vuelve a poner al final y permite que el worker continúe con los demás. Esto es una forma simple de resiliencia.

### Pregunta clave

¿Qué pasaría si la notificación se ejecutara directamente dentro del consumidor pub/sub?

Respuesta esperada:

> El consumidor quedaría acoplado al proveedor de notificaciones. Un timeout externo podría ralentizar o romper una reacción que debería ser diferida y reintentable.

## Escenario 5 — Streaming de telemetría normal

### Situación

Un dron envía telemetría periódica. No necesita una respuesta de negocio por cada paquete; necesita transportar un flujo continuo.

### Ejecución

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --normal --count=3 --interval-ms=0
```

### Resultado esperado

```text
Telemetry simulator: normal
Transport: local-lab-simulation
Packets sent: 3
Interval ms: 0
First packet: drone-001
Last packet: drone-003
```

### Interpretación

El simulador genera paquetes de telemetría como flujo. En modo local no requiere servidor: sirve para observar cadencia, volumen y estructura del stream.

### Pregunta clave

¿Por qué no modelar esto como `POST /telemetry` por cada paquete?

Respuesta esperada:

> Porque telemetría es un flujo continuo. Un request HTTP por paquete agrega overhead, presión de conexión y una semántica de petición/respuesta que no representa bien el dato.

## Escenario 6 — Streaming en concierto masivo

### Situación

AURA opera durante un concierto masivo. La carga esperada puede llegar a decenas de miles de eventos de telemetría por minuto.

### Ejecución local sin servidor

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --concert --count=100 --skip-delay
```

### Resultado esperado

```text
Telemetry simulator: concert
Transport: local-lab-simulation
Packets sent: 100
Interval ms: 0
First packet: drone-001
Last packet: drone-005
```

### Ejecución opcional contra gRPC real

Terminal 1:

```bash
cd services/monitor-telemetria
npm start
```

Terminal 2:

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --concert --count=20 --target=127.0.0.1:50051
```

Resultado esperado:

```text
Telemetry simulator: concert
Transport: grpc-client-stream
Target: 127.0.0.1:50051
Packets sent: 20
Ack: {"success":true,"message":"Packets procesados: 20"}
```

Si el puerto `50051` está ocupado, levantá el servidor en otro puerto y apuntá el simulador a ese puerto. Por ejemplo:

Terminal 1:

```bash
cd services/monitor-telemetria
PORT=50052 npm start
```

Terminal 2:

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --concert --count=20 --target=127.0.0.1:50052
```

### Interpretación

El stream permite enviar muchos paquetes dentro de una comunicación orientada a flujo. El servidor devuelve un ack final con la cantidad procesada.

### Nota para la siguiente sesión

El simulador todavía no implementa backpressure real sobre `call.write()`. Eso queda como puente natural hacia la Sesión 18: presión de consumidores, buffering y límites del desacoplamiento.

## Preguntas de cierre

| Pregunta | Respuesta esperada |
|---|---|
| ¿Toda comunicación distribuida debería implementarse igual? | No. Cada flujo tiene distinta necesidad de latencia, acoplamiento, resiliencia y semántica de negocio. |
| ¿Por qué la creación de orden sigue siendo request/response? | Porque la ruta es necesaria para confirmar la orden sin efecto parcial. |
| ¿Por qué `OrderCreated` no debería llamar directamente a auditoría, dashboard y notificaciones? | Porque aumentaría acoplamiento; pub/sub permite sumar consumidores sin cambiar el publicador. |
| ¿Por qué notificaciones van a cola? | Porque son trabajo lento/no crítico; la cola absorbe picos y permite retry. |
| ¿Por qué no usar REST por cada packet de telemetría? | Porque el concierto genera flujo continuo; streaming reduce overhead y expresa mejor la naturaleza del dato. |
| ¿Qué evento requiere más durabilidad: telemetría o `EntregaCompletada`? | `EntregaCompletada`, porque representa un cambio crítico de negocio. La telemetría puede tolerar políticas distintas según monitoreo/analítica. |

## Checklist de validación

- [ ] `services/centro-logistica` ejecuta `npm test` correctamente.
- [ ] `services/monitor-telemetria` ejecuta `npm test` correctamente.
- [ ] El estudiante puede explicar request/response usando creación de orden y planificación de ruta.
- [ ] El estudiante puede identificar `OrderCreated` como hecho de negocio para pub/sub.
- [ ] El estudiante puede diferenciar pub/sub de cola FIFO.
- [ ] El estudiante puede ejecutar modo normal y modo concierto del simulador de telemetría.
- [ ] El estudiante puede justificar por qué este laboratorio no introduce broker real todavía.

## Archivos clave

| Archivo | Rol |
|---|---|
| `services/centro-logistica/src/lab-event-bus.js` | Bus pub/sub in-memory para laboratorio. |
| `services/centro-logistica/src/lab-work-queue.js` | Cola FIFO in-memory para trabajos lentos. |
| `services/centro-logistica/src/order-created-lab.js` | Escenario integrado de `OrderCreated`, fan-out y notificaciones en cola. |
| `services/centro-logistica/test/lab-event-bus.test.js` | Pruebas del bus pub/sub. |
| `services/centro-logistica/test/lab-work-queue.test.js` | Pruebas de cola FIFO y retry. |
| `services/centro-logistica/test/order-created-lab.test.js` | Pruebas del laboratorio integrado. |
| `services/monitor-telemetria/src/telemetry-stream-simulator.js` | Simulador CLI de telemetría normal y concierto/burst. |
| `services/monitor-telemetria/test/telemetry-stream-simulator.test.js` | Pruebas del simulador de streaming. |

## Problemas comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `npm test` no encuentra módulos | Dependencias no instaladas en el servicio. | Ejecutar `npm install` dentro del servicio correspondiente. |
| El simulador gRPC falla contra `127.0.0.1:50051` | El servidor no está levantado o el puerto está ocupado. | Ejecutar `npm start` o usar `PORT=50052 npm start` y `--target=127.0.0.1:50052`. |
| El modo concierto tarda demasiado | Se ejecutó con delay activo. | Usar `--skip-delay` para laboratorio rápido. |
| Se confunde pub/sub con cola | Ambos desacoplan, pero no resuelven lo mismo. | Revisar la tabla “Diferencia entre pub/sub y cola”. |
