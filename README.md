# AURA Drone System

**AURA** es el proyecto de laboratorio del curso de **Sistemas Distribuidos / Arquitectura Distribuida**. El caso de estudio simula un sistema de orquestación de drones para entregas urbanas, construido paso a paso con microservicios, contratos REST/gRPC, resiliencia, eventos y decisiones arquitectónicas defendibles.

El objetivo no es “hacer endpoints porque sí”. El objetivo es que el estudiante aprenda a diseñar, implementar, probar y justificar sistemas distribuidos reales: sistemas donde hay latencia, fallas parciales, duplicados, contratos versionados, servicios que no siempre responden y decisiones técnicas que tienen consecuencias.

## Estado actual

El estado actual del repo es **Unidad 2 cerrada con PC02**, **Unidad 3 consolidada hasta la Sesión 29 implementada** y **Sesión 30 / PC3 documentada como evaluación aplicada**.

Esto significa que el proyecto ya no debe leerse solo como una secuencia de laboratorios. La **Práctica Calificada 02** cierra resiliencia, semánticas de entrega, backpressure, patrones de comunicación, naming y discovery básico. La **Unidad 3** empieza desde ese piso para estudiar tiempo, orden, causalidad y coordinación distribuida.

Ruta principal para revisar el hito actual:

```text
docs/PC02-20261.pdf        # enunciado original de la práctica
docs/pc2-respuestas.md     # solución docente, evidencia y decisiones técnicas
docs/instrucciones-laboratorio-sesion-30.md  # guía oficial de PC3
docs/pc3-respuestas.md     # entrega esperada del estudiante para PC3 (a crear)
```

| Área | Estado |
|---|---|
| Hito vigente | **PC02 cerrada; Unidad 3 consolidada hasta Sesión 29 implementada; Sesión 30 / PC3 documentada para evaluación aplicada**. |
| Arquitectura base | Alineada y documentada para sesiones 11–18. |
| REST v1 | Implementado en `gestor-flota`, `centro-logistica` y `planificador-rutas`. |
| gRPC | Implementado en `monitor-telemetria`. |
| Resiliencia | `centro-logistica → planificador-rutas` con timeout, retry limitado, backoff exponencial con jitter, clasificación retryable/no retryable y propagación de headers. |
| Semánticas de entrega | Consumidor in-memory de `EntregaCompletada` con idempotencia por `eventId` y estado de negocio. |
| Patrones de comunicación | Laboratorio in-memory para request/response, pub/sub, cola FIFO y streaming. |
| Backpressure | Laboratorio in-memory para presión de streaming, cola bounded, backlog, drops/sampling y retry. |
| Naming/discovery | Comunicación inter-servicio mediante configuración y nombres lógicos en Docker Compose. |
| Tiempo físico, sincronización, causalidad y coordinación | Laboratorios determinísticos en `monitor-telemetria` para wall-clock, monotonic clock, skew, drift, tolerancia, offset, delay, corrección, confianza, Lamport clocks, vector clocks, `happened-before`, concurrencia, exclusión mutua distribuida, locks, leases, TTL, expiración, stale owner, elección de líder, heartbeats, sospechas, detectores de fallas, coordinación aplicada con compensación e integración de evidencia para defensa PC3. |
| Tests | Suites por servicio con `npm test`. |

## Qué queda construido al cierre de PC02

La PC02 consolida la capa de comunicación distribuida de AURA. Al llegar a este punto, el estudiante puede demostrar:

- gestión de drones mediante REST;
- gestión de órdenes de entrega mediante REST;
- planificación de rutas como servicio separado;
- telemetría por gRPC streaming;
- resiliencia con timeout, retry, backoff exponencial con jitter e idempotencia;
- trazabilidad básica con `X-Correlation-Id`;
- propagación de intención de negocio con `Idempotency-Key`;
- consumo idempotente de eventos críticos como `EntregaCompletada`;
- presión operacional con backlog, lag, drops, sampling, retry y colas bounded;
- selección justificada de request/response, pub/sub, cola y streaming;
- naming/discovery básico mediante variables de entorno y nombres lógicos de servicio.

El objetivo defendible de PC02 es claro: una orden se recibe, se planifica, resiste fallas parciales, evita duplicados de negocio y permite explicar qué flujos se degradan y cuáles no se descartan.

## Cómo revisar PC02

La solución de PC02 integra cuatro frentes: resiliencia síncrona, consumo idempotente de `EntregaCompletada`, evidencia de backpressure y revisión de naming/discovery.

Guía docente completa:

```text
docs/pc2-respuestas.md
```

Verificación mínima:

```bash
cd services/centro-logistica
npm test
```

```bash
cd services/planificador-rutas
npm test
```

Evidencia operacional recomendada:

```bash
cd services/centro-logistica
npm run lab:delivery-events duplicate-event
npm run lab:delivery-events same-mission-different-event
npm run lab:delivery-events wrong-mission
npm run lab:backpressure -- --controlled
npm run lab:operational-pressure -- --controlled
```

Puntos que debe poder defender la entrega:

| Fase PC02 | Evidencia |
|---|---|
| Resiliencia | Timeout, retry limitado, backoff exponencial con jitter, clasificación retryable/no retryable y propagación de `X-Correlation-Id`/`Idempotency-Key`. |
| `EntregaCompletada` | Evento nuevo procesado, duplicado por `eventId` ignorado, evento distinto sobre misión ya completada sin efecto duplicado, misión inválida rechazada. |
| Backpressure | Métricas `produced/sent`, `accepted`, `processed`, `dropped/sampled`, `buffered/backlog/queueDepth`, `consumerLag/lag`, `rejected` y `retry`. |
| Naming/discovery | `PLANIFICADOR_RUTAS_URL` para comunicación inter-servicio y nombres consistentes de eventos/tópicos en labs. |

## Servicios del sistema

| Servicio | Puerto local | Responsabilidad | Contrato principal |
|---|---:|---|---|
| `services/gestor-flota` | `8001` | Registrar y consultar drones. | REST `/api/v1/drones` |
| `services/centro-logistica` | `8002` | Crear órdenes y coordinar planificación. | REST `/api/v1/orders` |
| `services/planificador-rutas` | `8003` | Calcular rutas para entregas. | REST `/api/v1/routes/plan` |
| `services/monitor-telemetria` | `50051` | Recibir telemetría de drones. | gRPC `TelemetryService` |
| `services/observability-platform` | `8010` | Visualizar laboratorios educativos de observabilidad. | HTTP `/api/labs` |

## Ejecución rápida

### Con Docker Compose

Desde la raíz del proyecto:

```bash
docker compose up --build
```

La plataforma educativa de observabilidad queda disponible en:

```text
http://localhost:8010
```

Validación rápida:

```bash
curl -i http://localhost:8001/health
curl -i http://localhost:8002/health
curl -i http://localhost:8003/health
curl -i http://localhost:8010/health
```

> Nota: `centro-logistica` usa `PLANIFICADOR_RUTAS_URL=http://planificador-rutas:8000` dentro de Docker Compose.

Smoke test de la plataforma de observabilidad:

```bash
cd services/observability-platform
npm run smoke
```

El smoke test valida `/health`, `/api/labs`, los modos y ejecuciones principales de `physical-time`, `clock-sync`, `lamport-ordering`, `vector-clocks`, `mutual-exclusion`, `distributed-locks`, `leader-election`, `distributed-coordination` y `coordination-integration`, `/` y `/app.js` contra `http://localhost:8010`.

### Por servicio

En cada carpeta de servicio:

```bash
npm install
npm start
```

Pruebas:

```bash
npm test
```

Regresión recomendada:

```bash
cd services/centro-logistica && npm test
cd ../planificador-rutas && npm test
cd ../monitor-telemetria && npm test
cd ../gestor-flota && npm test
cd ../observability-platform && npm test
```

## Ruta didáctica de la Unidad 2

La unidad está organizada en sesiones incrementales y un hito integrador. Cada sesión agrega una decisión, un contrato, una prueba o una pieza ejecutable. La PC02 no aparece como “otro documento”: valida que las piezas construidas hasta la sesión 18 funcionan juntas bajo presión.

| Hito | Tema central | Entregables | Aporte al proyecto final |
|---|---|---|---|
| 11 | Fundamentos de comunicación distribuida | Arquitectura base, responsabilidades de servicios, alcance MVP. | Define qué existe en AURA, qué servicio hace qué y cuál es el flujo principal. |
| 12 | Síncrono vs asíncrono, latencia y fallas parciales | Matriz de comunicación, fallas esperadas, timeouts iniciales. | Evita diseñar “como si la red fuera perfecta”; prepara decisiones de resiliencia. |
| 13 | REST, gRPC, contratos e IDL | Contratos v1, estructura base, `telemetry.proto`, primeras pruebas. | Convierte la arquitectura en APIs y contratos ejecutables. |
| 14 | Serialización, versionado y compatibilidad | Norma `/api/v1`, reglas JSON/protobuf, estados y eventos. | Permite evolucionar el sistema sin romper consumidores. |
| 15 | Timeouts, retries, backoff e idempotencia | Política de resiliencia, tests de falla, guía de laboratorio. | Hace que el flujo `centro-logistica → planificador-rutas` tolere fallas reales. |
| 16 | Semánticas de entrega | Consumidor idempotente de `EntregaCompletada`, matriz de semánticas, pruebas de duplicados y pérdida. | Define qué pasa cuando un mensaje llega dos veces, tarde o nunca. |
| 17 | Request/response, pub/sub, colas y streaming | Laboratorio didáctico con REST, gRPC streaming, pub/sub y cola FIFO in-memory. | Compara patrones de comunicación sobre flujos reales de AURA sin introducir broker todavía. |
| 18 | Backpressure y desacoplamiento | Laboratorio de presión con buffers bounded, backlog, drops/sampling, retry y reducción de tasa. | Evita confundir desacoplamiento con capacidad infinita. |
| **PC02** | Integración evaluada de Unidad 2 | Solución docente, pruebas, laboratorios y justificación técnica. | Comprueba que resiliencia, eventos, backpressure, patrones y naming se pueden defender como sistema. |
| 19 | Naming, identificadores y discovery | Catálogo de IDs, nombres de eventos, servicios y claves técnicas. | Da consistencia operativa al sistema y prepara trazabilidad. |
| 20 | Integración y cierre | Demo integrada, decisiones arquitectónicas y backlog de Unidad 3. | Cierra un MVP defendible y deja el camino para coordinación distribuida avanzada. |

## Ruta didáctica de la Unidad 3

La Unidad 3 parte de una pregunta incómoda pero necesaria: si cada nodo observa su propio tiempo, ¿cómo defendemos orden, causalidad y decisiones coordinadas?

| Hito | Tema central | Entregables | Aporte al proyecto final |
|---|---|---|---|
| 21 | Tiempo físico, skew, drift y límites de sincronización | Laboratorio `lab:physical-time`, tests y guía de laboratorio. | Demuestra que los timestamps físicos son útiles como metadatos, pero no prueban orden global ni reemplazan relojes monotónicos para duraciones. |
| **22** | Sincronización de relojes: visión general y efectos en sistemas distribuidos | Laboratorio `lab:clock-sync`, tests y guía de laboratorio. | Muestra cómo estimar offset/delay, aplicar correcciones y evaluar confianza sin vender sincronización como orden global perfecto. |
| **23** | Lamport clocks y orden parcial | Laboratorio `lab:lamport-ordering`, tests, guía y visualización en observability-platform. | Permite razonar sobre orden parcial y `happened-before` sin confiar solo en hora física. |
| **24** | Vector clocks y causalidad | Laboratorio `lab:vector-clocks`, tests, guía y visualización en observability-platform. | Distingue eventos causalmente relacionados de eventos concurrentes con más precisión. |
| **25** | Exclusión mutua distribuida | Laboratorio `lab:mutual-exclusion`, tests, guía y visualización en observability-platform. | Modela de forma determinística cómo arbitrar el acceso a una sección crítica compartida; no es una implementación productiva de mutex distribuido. |
| **26** | Locks distribuidos, leases y riesgos operativos | Laboratorio `lab:distributed-locks`, tests, guía y visualización en observability-platform. | Muestra por qué un lock distribuido necesita ownership temporal, TTL, expiración, renovación prudente y manejo de dueños stale. |
| **27** | Elección de líder y detectores de fallas | Laboratorio `lab:leader-election`, tests, guía y visualización en observability-platform. | Permite decidir quién coordina cuando hay múltiples nodos candidatos y fallas parciales. |
| **28** | Coordinación distribuida en escenarios reales | Laboratorio `lab:distributed-coordination`, tests, guía y visualización en observability-platform. | Integra tiempo, causalidad, leases, líder, sospecha de fallas y compensación en decisiones defendibles de AURA. |
| **29** | Laboratorio integrador de sincronización y coordinación | Laboratorio `lab:coordination-integration`, tests, guía y visualización en observability-platform. | Prepara evidencia técnica para PC3 defendiendo aceptar, revisar o compensar una acción distribuida. |
| **30** | Práctica Calificada 3 - AURA: Coordinación bajo falla | Guía oficial `docs/instrucciones-laboratorio-sesion-30.md`, entrega esperada `docs/pc3-respuestas.md`, implementación acotada y evidencia de ejecución. | Evalúa aplicación integrada de sincronización, causalidad, leases, fencing, detectores de fallas, elección de líder y decisión arquitectónica sobre un incidente nuevo. |

## Qué aprende el estudiante

Al trabajar este proyecto, el estudiante practica competencias que sí aparecen en sistemas distribuidos reales:

- diseñar límites entre servicios;
- elegir REST, gRPC, eventos o colas según el problema;
- versionar contratos sin romper consumidores;
- manejar fallas parciales y latencia;
- aplicar timeout, retry, backoff e idempotencia;
- probar comportamiento distribuido, no solo funciones aisladas;
- documentar decisiones técnicas con evidencia;
- construir un MVP incremental y defendible.

## Entregables esperados por sesión

Cada sesión debe dejar evidencia. No alcanza con decir “se entendió”: debe existir un artefacto revisable.

| Tipo de entregable | Ejemplos en este repo |
|---|---|
| Decisión arquitectónica | Matrices, políticas y criterios en `docs/`. |
| Contrato | Endpoints REST `/api/v1`, archivo protobuf, payloads JSON. |
| Prueba ejecutable | `npm test` por servicio. |
| Evidencia de laboratorio | Guías y bitácoras en `docs/`. |
| Implementación mínima | Código Node.js/Express/gRPC en `services/`. |

Regla de trabajo por sesión:

1. decisión arquitectónica;
2. contrato;
3. prueba o escenario de validación;
4. implementación mínima;
5. evidencia para defender la decisión.

## Base didáctica actual: Sesiones 21, 22, 23, 24, 25, 26, 27, 28, 29 y PC3

La plataforma de observabilidad expone nueve laboratorios conectados; la PC3 usa esa base como evaluación aplicada:

- **Sesión 21 — Tiempo físico:** muestra wall-clock, monotonic clock, skew, drift y ventanas de tolerancia.
- **Sesión 22 — Sincronización de relojes:** construye sobre esa base para estimar offset/delay, aplicar correcciones y evaluar confianza.
- **Sesión 23 — Lamport clocks:** usa relojes lógicos para razonar sobre `happened-before`, concurrencia y desempates determinísticos.
- **Sesión 24 — Vector clocks:** compara vectores para distinguir causalidad, igualdad y concurrencia incomparables.
- **Sesión 25 — Exclusión mutua distribuida:** usa una simulación educativa con arbitraje determinístico por timestamp lógico y `nodeId` para estudiar una sección crítica compartida, sin presentarse como mutex distribuido productivo.
- **Sesión 26 — Locks distribuidos y leases:** modela ownership temporal con TTL, expiración, renovación con jitter, stale owner y advertencia de fencing como evidencia.
- **Sesión 27 — Elección de líder y detectores de fallas:** compara líder estable, falla, reelección, sospecha falsa y reincorporación con heartbeats y timeouts simulados.
- **Sesión 28 — Coordinación distribuida en escenarios reales:** combina tiempo, causalidad, leases, líder, sospechas y compensación para defender decisiones AURA sin afirmar consenso.
- **Sesión 29 — Laboratorio integrador de sincronización y coordinación:** cruza evidencia de sesiones 21-28 para decidir si una acción se acepta, requiere revisión o se compensa antes de PC3.
- **Sesión 30 — PC3, coordinación bajo falla:** aplica la defensa integrada a un incidente nuevo y exige respuesta estructurada, implementación acotada, evidencia y matriz de decisión arquitectónica.

La Sesión 29 consolida la defensa integradora para PC3 con límites explícitos:

```text
Lamport local event: counter = counter + 1
Lamport send: counter = counter + 1; adjuntar messageClock
Lamport receive: counter = max(localCounter, messageClock) + 1
happened-before: programa local o send -> receive
concurrent events: sin relación causal directa
tie-break by nodeId: orden estable de presentación, no causalidad
Vector local/send: VC[node] = VC[node] + 1
Vector receive: VC = max(local, message) por componente; luego VC[node]++
vector comparison: before | after | equal | concurrent
mutex request order: logicalTimestamp asc, then nodeId asc
critical section safety: cero ventanas solapadas para el mismo recurso
lease ownership: owner + acquiredAt + leaseDeadline
leaseDeadline: acquiredAt + ttlMs
stale owner: acción posterior a expiredAt o con fencingToken anterior
fencing token: evidencia de generación, no infraestructura completa en esta sesión
leader election: mayor prioridad entre candidatos no sospechados
detector de fallas: silencio desde último heartbeat recibido por el observador >= failureTimeoutMs
false suspicion: heartbeat tardío puede limpiar una sospecha
rejoin: nodo recuperado vuelve como follower para evitar thrashing
coordination decision: causal evidence + valid lease + current leader + suspicion state
expired lease prevention: una historia causal válida no autoriza acción posterior al leaseDeadline
degraded compensation: sospecha de líder -> pausar, reencolar y evitar duplicación
coordination integration: physical time + clock sync + Lamport + vector clocks + lease + leader + suspicion + compensation
PC3 defense boundary: no consensus, no quorum, no Raft/Paxos, no production membership, no distributed transactions, no real failover
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:lamport-ordering -- --causal-chain
npm run lab:lamport-ordering -- --concurrent-events
npm run lab:lamport-ordering -- --merge-and-tie-break
npm run lab:vector-clocks -- --causal-chain
npm run lab:vector-clocks -- --concurrent-events
npm run lab:vector-clocks -- --merge-and-conflict
npm run lab:mutual-exclusion -- --contended-queue
npm run lab:mutual-exclusion -- --fairness-rounds
npm run lab:mutual-exclusion -- --critical-section-safety
npm run lab:mutual-exclusion -- --delay-and-reorder
npm run lab:distributed-locks -- --lock-acquire-and-hold
npm run lab:distributed-locks -- --lease-expiry-and-reacquire
npm run lab:distributed-locks -- --renewal-jitter-and-risk
npm run lab:distributed-locks -- --stale-owner-and-fencing-warning
npm run lab:leader-election -- --stable-leader-heartbeats
npm run lab:leader-election -- --leader-failure-and-reelection
npm run lab:leader-election -- --false-suspicion-timeout
npm run lab:leader-election -- --leader-recovery-rejoin
npm run lab:distributed-coordination -- --coordinated-dispatch-handoff
npm run lab:distributed-coordination -- --expired-lease-prevention
npm run lab:distributed-coordination -- --degraded-compensation
npm run lab:coordination-integration -- --pc3-ready-happy-path
npm run lab:coordination-integration -- --causal-conflict-review
npm run lab:coordination-integration -- --suspected-leader-compensation
```

Visualización educativa:

```bash
cd services/observability-platform
npm start
```

Luego abre `http://localhost:8010` para revisar el cockpit de observabilidad de las Sesiones 21, 22, 23, 24, 25, 26, 27, 28 y 29. La Sesión 29 queda activa como laboratorio actual de integración para defensa PC3.

Guías completas de la base 21-29 y evaluación PC3:

```text
docs/instrucciones-laboratorio-sesion-21.md
docs/instrucciones-laboratorio-sesion-22.md
docs/instrucciones-laboratorio-sesion-23.md
docs/instrucciones-laboratorio-sesion-24.md
docs/instrucciones-laboratorio-sesion-25.md
docs/instrucciones-laboratorio-sesion-26.md
docs/instrucciones-laboratorio-sesion-27.md
docs/instrucciones-laboratorio-sesion-28.md
docs/instrucciones-laboratorio-sesion-29.md
docs/instrucciones-laboratorio-sesion-30.md
```

Guía detallada de la Sesión 30 / PC3:

```text
docs/instrucciones-laboratorio-sesion-30.md
```

Alcance explícito: la Sesión 29 integra razonamiento de sincronización y coordinación para defensa PC3. La Fase 5 de PC3 pide una implementación acotada, no consenso, quórum, Raft/Paxos, membresía productiva, transacciones distribuidas ni failover real. Herramientas como etcd, ZooKeeper o Raft pueden recomendarse en la Fase 6 solo si se justifican garantías y tradeoffs.

## Laboratorio anterior: Sesión 25

La Sesión 25 muestra un modelo educativo de arbitraje determinístico para estudiar una sección crítica compartida antes de introducir vencimiento de leases. La garantía se interpreta dentro de la simulación del laboratorio; no representa una implementación productiva de exclusión mutua distribuida:

```text
mutex request order: logicalTimestamp asc, then nodeId asc
critical section safety del modelo: cero ventanas solapadas para el mismo recurso en la evidencia simulada
ciclo: request -> wait/queued -> grant -> enter-critical-section -> release/exit
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:mutual-exclusion -- --contended-queue
npm run lab:mutual-exclusion -- --fairness-rounds
npm run lab:mutual-exclusion -- --critical-section-safety
npm run lab:mutual-exclusion -- --delay-and-reorder
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-25.md
```

## Laboratorio anterior: Sesión 24

La Sesión 24 muestra cómo vector clocks distinguen eventos causalmente relacionados de eventos concurrentes sin inventar orden global:

```text
Vector local/send: VC[node] = VC[node] + 1
Vector receive: VC = max(local, message) por componente; luego VC[node]++
vector comparison: before | after | equal | concurrent
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:vector-clocks -- --causal-chain
npm run lab:vector-clocks -- --concurrent-events
npm run lab:vector-clocks -- --merge-and-conflict
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-24.md
```

## Laboratorio anterior: Sesión 23

La Sesión 23 muestra cómo Lamport clocks permiten razonar sobre orden parcial, concurrencia y desempates determinísticos sin vender el contador escalar como causalidad completa:

```text
local event: counter = counter + 1
send: counter = counter + 1; adjuntar messageClock
receive: counter = max(localCounter, messageClock) + 1
concurrent events: sin relación causal directa
tie-break by nodeId: orden estable de presentación, no causalidad
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:lamport-ordering -- --causal-chain
npm run lab:lamport-ordering -- --concurrent-events
npm run lab:lamport-ordering -- --merge-and-tie-break
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-23.md
```

## Base previa: Sesión 22

La Sesión 22 muestra qué aporta la sincronización de relojes y dónde están sus límites:

```text
NTP-style timestamps: t0, t1, t2, t3
roundTripDelayMs: latencia ida/vuelta descontando procesamiento remoto
estimatedOffsetMs: diferencia estimada entre reloj local y referencia
asymmetric delay: la red puede sesgar la estimación
step vs slew: corrección abrupta o gradual
stale sync: la confianza cae cuando crece el error estimado
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:clock-sync -- --normal
npm run lab:clock-sync -- --asymmetric-delay
npm run lab:clock-sync -- --correction-policy
npm run lab:clock-sync -- --stale-sync
npm run lab:clock-sync -- --telemetry-impact
npm run lab:clock-sync -- --scenario-analysis
```

Visualización educativa inicial:

```bash
cd services/observability-platform
npm start
```

Luego abre `http://localhost:8010` para revisar el cockpit de observabilidad.

También puede levantarse desde Docker Compose en la raíz del proyecto:

```bash
docker compose up --build observability-platform
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-22.md
```

## Laboratorio anterior: Sesión 21

La Sesión 21 muestra los límites prácticos del tiempo físico en sistemas distribuidos:

```text
wall-clock: útil para metadatos humanos, peligroso para duraciones
monotonic clock: correcto para medir latencia, timeout y elapsed time
skew/offset: relojes de nodos pueden diferir
drift: el error crece entre sincronizaciones
tolerance window: el servidor valida cuánto error acepta
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:physical-time -- --skew
npm run lab:physical-time -- --drift
npm run lab:physical-time -- --tolerance
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-21.md
```

## Laboratorio anterior: Sesión 18

La Sesión 18 muestra que desacoplar no elimina la presión: hay que medir backlog, lag, límites y velocidad de consumo.

```text
streaming pressure: telemetría -> buffer bounded -> consumidor lento
queue pressure: OrderCreated -> notificaciones bounded -> retry/defer
operational pressure: concierto -> pedidos + drones + entregas + auditoría + dashboard
business rule: telemetría puede samplearse; auditoría/EntregaCompletada no se descartan silenciosamente
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:telemetry-pressure -- --saturated
```

```bash
cd services/centro-logistica
npm run lab:backpressure -- --controlled
```

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --concert
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-18.md
```

## Laboratorio anterior: Sesión 17

La Sesión 17 compara patrones de comunicación sobre flujos AURA:

```text
request/response: centro-logistica -> planificador-rutas
pub/sub: OrderCreated -> notificaciones + auditoría + dashboard
cola FIFO: trabajos de notificación
streaming: telemetría de drones
```

Comandos principales:

```bash
cd services/centro-logistica
npm run lab:communication-patterns -- --orders=5
```

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --concert --count=100 --skip-delay
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-17.md
```

## Laboratorio anterior: Sesión 16

La Sesión 16 valida semánticas de entrega para eventos de negocio:

```text
EntregaCompletada → centro-logistica
```

Logro esperado:

> El estudiante implementa un consumidor idempotente que procesa `EntregaCompletada` con semántica at-least-once, deduplicando por `eventId` y protegiendo el efecto final con estado de negocio.

Simulador didáctico por escenario:

```bash
cd services/centro-logistica
node src/delivery-events-lab.js duplicate-event
```

Escenarios cubiertos:

| Escenario | Resultado esperado |
|---|---|
| Mensaje perdido | Sin duplicado, pero orden y dron quedan desactualizados. |
| Evento duplicado con mismo `eventId` | Segunda llegada ignorada; efecto aplicado una sola vez. |
| Evento distinto para la misma misión | Estado de orden evita reaplicar entrega. |
| Evento inconsistente | Rechazo reportado; sin liberar dron ni entregar orden. |

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-16.md
```

## Laboratorio anterior: Sesión 15

La Sesión 15 valida resiliencia en el flujo:

```text
centro-logistica → planificador-rutas
```

Logro esperado:

> El estudiante define e implementa en Node.js una política básica de timeout, retry, backoff e idempotencia para la interacción Centro de Logística → Planificador de Rutas, simulando fallos y evitando la creación duplicada de misiones para una misma orden de entrega.

Escenarios cubiertos:

| Escenario | Resultado esperado |
|---|---|
| Camino feliz | Ruta planificada, una sola orden creada. |
| Servicio lento | Timeout controlado, retry con backoff, sin duplicar misión. |
| Planificador no disponible | Retries agotados, respuesta controlada, sin persistencia parcial. |
| Zona inválida | Error no retryable `422`, sin retry, sin crear orden. |
| Doble solicitud con misma `Idempotency-Key` | Segunda llamada devuelve replay idempotente, sin duplicar. |

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-15.md
```

## Documentación principal

| Documento | Propósito |
|---|---|
| `docs/GESTION SID 2026 I.pdf` | Fuente de verdad académica para la secuencia oficial de sesiones y unidades. |
| `docs/unidad-3-backlog.md` | Roadmap estratégico de sesiones 21–30 sobre tiempo, orden, causalidad, consenso y consistencia. |
| `docs/unidad-2-backlog.md` | Backlog y cronograma detallado de sesiones 11–20. |
| `docs/pc2-respuestas.md` | Solución docente de PC02 con comandos, evidencia, decisiones, limitaciones y checklist de revisión. |
| `docs/instrucciones-laboratorio-sesion-30.md` | Guía oficial de PC3: coordinación bajo falla, fases, entregables, rúbrica y checklist de entrega. |
| `docs/instrucciones-laboratorio-sesion-23.md` | Guía para estudiar Lamport clocks, orden parcial, concurrencia y desempate determinístico. |
| `docs/instrucciones-laboratorio-sesion-29.md` | Guía para defender integración de sincronización y coordinación antes de PC3. |
| `docs/instrucciones-laboratorio-sesion-28.md` | Guía para estudiar coordinación distribuida aplicada, leases, líder, sospechas y compensación. |
| `docs/instrucciones-laboratorio-sesion-27.md` | Guía para estudiar elección de líder, heartbeats, detectores de fallas, sospechas falsas y recuperación. |
| `docs/instrucciones-laboratorio-sesion-26.md` | Guía para estudiar locks distribuidos, leases, TTL, expiración, renovación y stale owner. |
| `docs/instrucciones-laboratorio-sesion-25.md` | Guía para estudiar exclusión mutua distribuida, cola de requests y sección crítica. |
| `docs/instrucciones-laboratorio-sesion-22.md` | Guía para estudiar sincronización de relojes, offset, delay, corrección, stale sync y confianza. |
| `docs/instrucciones-laboratorio-sesion-24.md` | Guía para estudiar vector clocks, causalidad, concurrencia y conflicto. |
| `docs/instrucciones-laboratorio-sesion-21.md` | Guía para estudiar tiempo físico, skew, drift, tolerancia y límites de sincronización. |
| `docs/sesiones-11-15-resiliencia.md` | Alineación técnica de sesiones 11–15 y política implementada. |
| `docs/instrucciones-laboratorio-sesion-18.md` | Guía para medir backpressure, backlog, sampling y colas bounded. |
| `docs/instrucciones-laboratorio-sesion-17.md` | Guía para comparar request/response, pub/sub, colas y streaming. |
| `docs/instrucciones-laboratorio-sesion-16.md` | Guía para validar semánticas de entrega e idempotencia de eventos. |
| `docs/instrucciones-laboratorio-sesion-15.md` | Guía paso a paso para validar resiliencia en laboratorio. |
| `docs/sesion-13-cierre-y-prueba-funcional.md` | Evidencia de cierre funcional inicial. |

## Cómo evaluar avances

Un avance de sesión está completo cuando cumple estas condiciones:

- el tema está explicado en `docs/`;
- existe código mínimo si la sesión lo requiere;
- hay prueba ejecutable o escenario verificable;
- la evidencia se puede repetir desde cero;
- el estudiante puede explicar por qué se tomó esa decisión técnica.

## Próximo paso

El siguiente trabajo es resolver la **Sesión 30: Práctica Calificada 3** siguiendo `docs/instrucciones-laboratorio-sesion-30.md`.

Ahí se evaluarán las evidencias de sesiones 21–29 aplicadas a un incidente nuevo. La entrega esperada vive en `docs/pc3-respuestas.md`; consenso completo, quórums productivos, membresía real, transacciones distribuidas y failover real siguen fuera del alcance de la implementación acotada de PC3.
