# PC02 — Solución docente de resiliencia, eventos y backpressure

Esta guía deja una respuesta completa y revisable para PC02. El foco no es solo que el código pase tests: la entrega debe poder defender timeout, retry, backoff exponencial con jitter, trazabilidad por correlación, idempotencia, eventos críticos y métricas de presión.

## Ruta rápida de verificación

Desde la raíz del repo, ejecutá:

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

## Resultado esperado por fase

| Fase | Resultado defendible | Evidencia en el repo |
|---|---|---|
| 1. Resiliencia | `centro-logistica` llama a `planificador-rutas` con timeout, retry limitado, backoff exponencial con jitter, clasificación retryable/no retryable y propagación de headers. | `services/centro-logistica/src/route-planner-client.js`, `services/centro-logistica/test/api.test.js` |
| 2. `EntregaCompletada` | El consumidor evita duplicar efectos de negocio ante duplicados por `eventId` o eventos distintos sobre una misión ya completada. | `services/centro-logistica/src/delivery-events-consumer.js`, `services/centro-logistica/test/delivery-events-consumer.test.js` |
| 3. Backpressure | Los labs reportan `produced`, `accepted`, `processed`, `dropped`, `buffered`, `queueDepth/backlog`, `consumerLag/lag`, retry y política por criticidad. | `services/centro-logistica/src/backpressure-lab.js`, `services/centro-logistica/src/operational-pressure-lab.js` |
| 4. Patrones y naming | Las llamadas entre servicios usan URL configurable por ambiente; eventos/labs mantienen nombres de tópico consistentes como `order.created` y tipos como `OrderCreated`. | `README.md`, `docker-compose.yml`, labs de sesiones 17 y 18 |

## Fase 1: Resiliencia síncrona

El flujo crítico es:

```text
POST /api/v1/orders
centro-logistica -> planificador-rutas POST /api/v1/routes/plan
```

Política implementada:

| Decisión | Implementación |
|---|---|
| Timeout por intento | `AbortController` limita cada llamada a `ROUTE_PLANNER_TIMEOUT_MS`. |
| Retry limitado | `ROUTE_PLANNER_RETRIES` define reintentos; intentos totales = `retries + 1`. No hay retry infinito. |
| Clasificación retryable | Se reintentan timeouts, errores de red, `408`, `429` y `5xx`. |
| Clasificación no retryable | `4xx` de negocio/validación, como `422`, no se reintentan y no persisten la orden. |
| Backoff | Cada reintento usa backoff exponencial: `base * 2^(attempt - 1)`. |
| Jitter | Se agrega jitter acotado por `base` para evitar reintentos sincronizados. |
| Correlación | `X-Correlation-Id` se preserva si llega; si falta, `centro-logistica` lo genera y lo devuelve. |
| Idempotencia | `Idempotency-Key` se mantiene como clave de intención de negocio y se propaga al planificador. |

Comando de prueba:

```bash
cd services/centro-logistica
npm test
```

Tests relevantes:

| Test | Qué demuestra |
|---|---|
| `reintenta con backoff cuando planificador-rutas excede timeout` | Timeout por intento y retry limitado. |
| `calcula backoff exponencial con jitter determinista` | Delay exponencial más jitter testeable. |
| `no reintenta ni persiste orden cuando planificador-rutas rechaza zona inválida` | `422` no retryable. |
| `propaga correlation id e idempotency key al planificador-rutas` | Trazabilidad e idempotencia atraviesan el límite de servicio. |
| `idempotency-key evita duplicar una orden repetida` | Repetir la misma intención no crea otra orden. |

## Fase 2: `EntregaCompletada`

El consumidor está diseñado para semántica at-least-once en memoria. Eso significa que puede recibir el mismo evento más de una vez, pero no debe aplicar efectos de negocio duplicados.

Escenarios esperados:

| Escenario PC02 | Resultado esperado | Evidencia |
|---|---|---|
| Evento nuevo | Orden pasa a `entregada`, dron pasa a `disponible`, `appliedEffects = 1`. | Test `at-least-once con mismo eventId aplica el efecto una sola vez`, primera llamada. |
| Duplicado con mismo `eventId` | Segunda llegada queda `ignored` por `duplicate_event_id`. | Test `at-least-once con mismo eventId aplica el efecto una sola vez`, segunda llamada. |
| Evento distinto para misión ya completada | No reaplica efecto porque la orden ya está `entregada`. | Test `eventos distintos para la misma misión no reaplican si la orden ya fue entregada`. |
| `missionId` inválido o inconsistente | Rechazo sin liberar dron ni entregar orden. | Test `evento con misión incorrecta se rechaza sin liberar dron ni entregar orden`. |

Comandos manuales:

```bash
cd services/centro-logistica
npm run lab:delivery-events duplicate-event
npm run lab:delivery-events same-mission-different-event
npm run lab:delivery-events wrong-mission
```

Limitación importante: la deduplicación usa memoria local. Es correcta para laboratorio, pero en producción debería persistirse en una base de datos o event store transaccional para sobrevivir reinicios y múltiples réplicas.

## Fase 3: Backpressure y evidencia operacional

PC02 pide mostrar presión con métricas claras, no solo decir “hay cola”. El repo ya expone métricas didácticas y deterministas.

Vocabulario esperado:

| Métrica | Dónde aparece | Lectura |
|---|---|---|
| `produced` | `operational-pressure-lab`, telemetría | Elementos generados por el productor. |
| `accepted` | `operational-pressure-lab`, telemetría | Elementos aceptados por el buffer bounded. |
| `processed` | Labs de cola, telemetría y eventos | Elementos consumidos o aplicados. |
| `dropped` | Telemetría/auditoría | Elementos descartados explícitamente. |
| `sampledOut` | Telemetría | Elementos omitidos por sampling controlado. |
| `buffered` / `backlog` | Telemetría y notificaciones | Trabajo pendiente. |
| `lag` | Telemetría | Diferencia entre aceptados y procesados. |
| `rejected` | Cola/notificaciones/órdenes/eventos | Trabajo rechazado de forma visible. |
| `retried` | Cola de notificaciones | Trabajo reintentado por fallo transitorio. |

Comando recomendado:

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --controlled
```

Salida esperada en modo controlado:

```text
Telemetry:
- produced=... accepted=... processed=... buffered/backlog=... dropped=... sampledOut=... lag=...
Notifications queue:
- enqueued=... processed=... backlog=... rejected=... retried=... deferred=...
Delivery events:
- received=... processed=... duplicatesIgnored=... rejected=... criticalDropped=0
Decision summary:
- Critical events: audit and EntregaCompletada were preserved; duplicates were idempotently ignored
```

Política por criticidad:

| Flujo | Criticidad | Política bajo presión |
|---|---|---|
| Telemetría | Operacional, alta frecuencia | Puede samplearse o descartarse de forma visible si el buffer se llena. |
| Notificaciones | Importante, reintentable | Cola bounded, retry limitado y diferimiento. |
| Dashboard/analytics | Degradable | Puede bajar precisión temporal. |
| Auditoría legal | Crítica | No se descarta silenciosamente. |
| `EntregaCompletada` | Crítica de negocio | Se preserva y se deduplica idempotentemente. |

## Fase 4: Naming, discovery y comunicación

Matriz de comunicación revisada:

| Origen | Destino | Patrón | Configuración | Nombre/contrato |
|---|---|---|---|---|
| `centro-logistica` | `planificador-rutas` | Request/response REST | `PLANIFICADOR_RUTAS_URL` | `POST /api/v1/routes/plan` |
| `centro-logistica` | consumidores didácticos | Pub/sub in-memory | Lab local | tópico `order.created`, tipo `OrderCreated` |
| Productor telemetría | `monitor-telemetria` | gRPC streaming | Servicio local/Docker | `TelemetryService` |
| Entrega | `centro-logistica` | Evento de negocio | Lab local | `EntregaCompletada` |

Revisión de discovery:

| Riesgo | Estado |
|---|---|
| IP interna hardcodeada entre contenedores | Evitada en Docker Compose mediante `PLANIFICADOR_RUTAS_URL=http://planificador-rutas:8000`. |
| `localhost` como contrato distribuido | Solo aceptable para ejecución manual local; no debe usarse como contrato entre contenedores. |
| Nombres de eventos mezclados | Los labs mantienen `order.created` para tópico técnico y `OrderCreated` para tipo de evento. |
| Trazabilidad rota entre servicios | `X-Correlation-Id` se propaga y `planificador-rutas` lo refleja. |

## Limitaciones conocidas

| Limitación | Por qué se acepta en PC02 | Qué haría producción |
|---|---|---|
| Idempotencia de eventos en memoria | Permite demostrar la semántica sin broker ni base externa. | Persistir `eventId` procesados con garantía transaccional. |
| Labs in-memory | Son deterministas y didácticos. | Broker real, métricas Prometheus/OpenTelemetry y alertas. |
| Jitter simple acotado por `base` | Suficiente para evitar sincronía en laboratorio. | Política full jitter/equal jitter definida por SRE y observada en producción. |
| Sin tracing distribuido real | `X-Correlation-Id` cubre trazabilidad básica. | OpenTelemetry con spans por servicio. |

## Checklist Final

- [ ] El estudiante debe explicar por qué no se reintentan errores `4xx` de negocio.
- [ ] El estudiante debe mostrar `X-Correlation-Id` entrando a `centro-logistica` y llegando a `planificador-rutas`.
- [ ] El estudiante debe repetir una solicitud con la misma `Idempotency-Key` sin duplicar orden.
- [ ] El estudiante debe demostrar que `EntregaCompletada` no duplica efectos.
- [ ] El estudiante debe leer backlog/lag/drops/retry en los labs de presión.
- [ ] El estudiante debe justificar qué se degrada y qué no se descarta.
