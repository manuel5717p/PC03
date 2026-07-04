# Laboratorio Sesión 16 — Semánticas de entrega en AURA

> No diseñamos para que los mensajes nunca fallen; diseñamos para que el efecto de negocio sea correcto aunque fallen, se pierdan o se dupliquen.

Esta guía valida la Sesión 16 mediante escenarios reales de AURA: pérdida de mensajes, entrega duplicada, eventos distintos para la misma misión y eventos inconsistentes. El foco no es instalar un broker todavía; el foco es demostrar que el **efecto de negocio** queda correcto aunque la entrega del mensaje sea imperfecta.

## Objetivo del laboratorio

Implementar y defender un consumidor in-memory de `EntregaCompletada` en `centro-logistica` que procese eventos con semántica **at-least-once** sin duplicar efectos.

Al finalizar, el estudiante debe poder explicar la diferencia entre:

| Concepto | Pregunta que responde |
|---|---|
| Entrega del mensaje | ¿El mensaje llegó al consumidor? |
| Procesamiento del consumidor | ¿El consumidor intentó procesarlo? |
| Efecto de negocio | ¿La orden cambió correctamente y el dron quedó en el estado correcto? |

## Alcance implementado

| Pieza | Decisión |
|---|---|
| Evento trabajado | `EntregaCompletada` |
| Servicio consumidor | `services/centro-logistica` |
| Transporte | In-memory para laboratorio, sin broker real todavía |
| Consumidor | `services/centro-logistica/src/delivery-events-consumer.js` |
| Simulador didáctico | `services/centro-logistica/src/delivery-events-lab.js` |
| Pruebas | `services/centro-logistica/test/delivery-events-consumer.test.js` |
| Deduplicación técnica | `eventId` |
| Validación de integridad | `missionId`, `orderId`, `droneId` |
| Protección de negocio | Si la orden ya está `entregada`, no reaplicar efecto |
| Efecto válido | Orden `entregada` y dron `disponible` |

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
```

## Validación rápida

Ejecutá toda la suite de `centro-logistica`:

```bash
cd services/centro-logistica
npm test
```

Resultado esperado:

```text
11/11 tests passing
```

Para ejecutar sólo los tests automatizados de Sesión 16:

```bash
cd services/centro-logistica
node --test test/delivery-events-consumer.test.js
```

Resultado esperado:

```text
4/4 tests passing
```

Para laboratorio en clase, usá el simulador por escenario. A diferencia del test automatizado, cada comando imprime qué entregas se simularon, qué respondió el consumidor, el estado final y cómo interpretar el resultado:

```bash
cd services/centro-logistica
node src/delivery-events-lab.js lost-message
node src/delivery-events-lab.js duplicate-event
node src/delivery-events-lab.js same-mission-different-event
node src/delivery-events-lab.js wrong-mission
```

## Escenarios de laboratorio

| Escenario | Semántica | Test asociado | Resultado esperado |
|---|---|---|---|
| 1. Mensaje perdido | at-most-once | `at-most-once con mensaje perdido deja la orden y el dron desactualizados` | No hay duplicado, pero el estado queda desactualizado. |
| 2. Evento duplicado | at-least-once | `at-least-once con mismo eventId aplica el efecto una sola vez` | La primera entrega procesa; la segunda se ignora por `eventId`. |
| 3. Misma misión, distinto evento | at-least-once + protección de negocio | `eventos distintos para la misma misión no reaplican si la orden ya fue entregada` | El segundo evento no reaplica porque la orden ya está `entregada`. |
| 4. Misión incorrecta | validación de integridad | `evento con misión incorrecta se rechaza sin liberar dron ni entregar orden` | Se rechaza; no cambia orden ni dron. |

## Escenario 1 — At-most-once con mensaje perdido

### Situación

`EntregaCompletada` se publica, pero se pierde antes de llegar al consumidor.

En el test esto se simula creando una orden, una misión y un dron, pero **sin invocar** el consumidor.

### Ejecución

```bash
cd services/centro-logistica
node src/delivery-events-lab.js lost-message
```

Test asociado:

```text
at-most-once con mensaje perdido deja la orden y el dron desactualizados
```

### Resultado esperado

```text
Scenario: lost-message
Consumer results:
- none: consumer was not invoked
Final state:
- order.status: en_vuelo
- drone.status: en_mision
- appliedEffects: 0
- duplicatedBusinessEffect: false
```

### Interpretación

No hay duplicado, pero el sistema queda desactualizado:

- la orden sigue `en_vuelo`;
- el dron sigue `en_mision`;
- no se aplicó el efecto de negocio.

### Pregunta clave

¿Es aceptable perder `EntregaCompletada`?

Respuesta esperada:

> No para un evento crítico de negocio. Para `EntregaCompletada` conviene at-least-once con consumidor idempotente.

## Escenario 2 — At-least-once con evento duplicado

### Situación

El broker entrega el mismo evento `EntregaCompletada` dos veces con el mismo `eventId`.

### Ejecución

```bash
cd services/centro-logistica
node src/delivery-events-lab.js duplicate-event
```

Test asociado:

```text
at-least-once con mismo eventId aplica el efecto una sola vez
```

### Resultado esperado

Primera entrega:

```text
- #1: {"status":"processed","applied":true}
```

Segunda entrega:

```text
- #2: {"status":"ignored","reason":"duplicate_event_id","applied":false}
```

Estado final:

```text
- order.status: entregada
- drone.status: disponible
- appliedEffects: 1
- duplicatedBusinessEffect: false
```

### Interpretación

El duplicado no rompe el negocio porque el consumidor registra el `eventId` procesado y no vuelve a aplicar el efecto.

### Pregunta clave

¿El duplicado rompió el negocio?

Respuesta esperada:

> No, porque el consumidor fue idempotente frente al mismo `eventId`.

## Escenario 3 — Eventos distintos para la misma misión

### Situación

Llegan dos eventos con distinto `eventId`, pero ambos representan la misma `missionId`.

Esto es más peligroso que el escenario 2: deduplicar sólo por `eventId` no alcanza.

### Ejecución

```bash
cd services/centro-logistica
node src/delivery-events-lab.js same-mission-different-event
```

Test asociado:

```text
eventos distintos para la misma misión no reaplican si la orden ya fue entregada
```

### Resultado esperado

Primer evento:

```text
- #1: {"status":"processed","applied":true}
```

Segundo evento con otro `eventId`:

```text
- #2: {"status":"ignored","reason":"order_already_delivered","applied":false}
```

Estado final:

```text
- order.status: entregada
- drone.status: disponible
- appliedEffects: 1
- duplicatedBusinessEffect: false
```

### Interpretación

El consumidor no depende solamente de `eventId`; también mira el estado de negocio.

Regla clave:

```text
Si order.status === entregada, no volver a aplicar efecto.
```

### Pregunta clave

Si `eventId` evita duplicados técnicos, ¿por qué igual necesitamos mirar `order.status`?

Respuesta esperada:

> Porque dos eventos diferentes pueden describir el mismo hecho de negocio. La idempotencia real se define por el efecto de negocio, no sólo por el identificador del mensaje.

## Escenario 4 — Evento con misión incorrecta

### Situación

Llega `EntregaCompletada` para una misión que no coincide con la orden o el dron esperado.

Ejemplo: el evento trae un `droneId` distinto al dron asociado a la misión.

### Ejecución

```bash
cd services/centro-logistica
node src/delivery-events-lab.js wrong-mission
```

Test asociado:

```text
evento con misión incorrecta se rechaza sin liberar dron ni entregar orden
```

### Resultado esperado

```text
- #1: {"status":"rejected","reason":"evento inconsistente con la misión","applied":false}
- order.status: en_vuelo
- drone.status: en_mision
- drone-002.status: en_mision
- appliedEffects: 0
- duplicatedBusinessEffect: false
- errors: [{"eventId":"event-bad-mission","reason":"evento inconsistente con la misión"}]
```

### Interpretación

La idempotencia no reemplaza la validación de integridad.

El consumidor debe rechazar el evento porque liberar el dron o marcar la orden como entregada sería un efecto de negocio incorrecto.

### Pregunta clave

¿La idempotencia alcanza para proteger un evento con misión incorrecta?

Respuesta esperada:

> No. También hay que validar integridad: `missionId`, `orderId`, `droneId` y estado actual.

## Matriz de semánticas aplicada a AURA

| Flujo AURA | Semántica sugerida | Motivo | Protección necesaria |
|---|---|---|---|
| Telemetría frecuente del dron | at-most-once o best effort controlado | Perder una muestra puede ser tolerable si llega otra enseguida. | `timestamp`, última lectura válida. |
| Telemetría crítica: batería baja | at-least-once | No conviene perder una alerta crítica. | Deduplicación por `packetId` o ventana temporal. |
| `EntregaCompletada` | at-least-once + consumidor idempotente | Perderlo rompe el estado de negocio. | `eventId`, `missionId`, estado de orden. |
| Asignación de misión | effectively-once | Duplicar misión es grave. | `idempotencyKey`, lock, restricción única. |
| Cambio de dron a mantenimiento | effectively-once | Evita asignación o transición incorrecta. | Control de estado y versión. |
| Evento de facturación posterior | effectively-once | Duplicar facturación es grave. | Dedup durable + transacción. |

## Política técnica esperada

| Campo | Decisión recomendada |
|---|---|
| Evento crítico de negocio | Usar at-least-once + consumidor idempotente. |
| Duplicado exacto | Deduplicar por `eventId`. |
| Duplicado semántico | Proteger por estado de negocio (`order.status`). |
| Integridad de evento | Validar `missionId`, `orderId` y `droneId`. |
| Pérdida de mensaje crítico | No aceptarla como diseño final; requiere retry, broker durable o reconciliación. |
| Efecto de negocio | Aplicar una sola vez: orden `entregada`, dron `disponible`. |
| Persistencia de dedup | In-memory para laboratorio; durable en producción. |

## Bitácora de laboratorio esperada

El estudiante debe entregar una tabla como esta:

| Escenario | Resultado observado | ¿Llegó el mensaje? | ¿Se procesó? | ¿Se duplicó el efecto? | Decisión correcta |
|---|---|---|---|---|---|
| At-most-once con mensaje perdido | | No | No | No, pero quedó desactualizado | No usar para evento crítico. |
| At-least-once con mismo `eventId` | | Sí, dos veces | Primera sí, segunda ignorada | No | Dedup por `eventId`. |
| Distinto `eventId`, misma misión | | Sí | Primera sí, segunda ignorada por estado | No | Proteger por estado de negocio. |
| Misión incorrecta | | Sí | Rechazado | No | Validar integridad antes de aplicar efecto. |

## Checklist de cierre

- [ ] `cd services/centro-logistica && npm test` pasa `11/11`.
- [ ] `node --test test/delivery-events-consumer.test.js` pasa `4/4`.
- [ ] Los cuatro comandos `node src/delivery-events-lab.js <escenario>` imprimen resultado e interpretación separados.
- [ ] El estudiante explica diferencia entre entrega, procesamiento y efecto de negocio.
- [ ] Se evidencia que perder `EntregaCompletada` deja el sistema desactualizado.
- [ ] Se evidencia que duplicar el mismo `eventId` no duplica el efecto.
- [ ] Se evidencia que otro `eventId` para la misma misión tampoco duplica el efecto.
- [ ] Se evidencia que una misión incorrecta no libera dron ni entrega orden.
- [ ] Se reconoce que la deduplicación actual es in-memory y no durable.

## Riesgos y pendientes conscientes

| Riesgo / pendiente | Impacto | Estado |
|---|---|---|
| Deduplicación in-memory | Se pierde en reinicio y no sirve para múltiples réplicas. | Aceptado para laboratorio. |
| Sin broker real | No prueba ACK/NACK real ni reentrega de broker. | Fuera de alcance de esta sesión. |
| Sin outbox/inbox durable | No hay garantía productiva de recuperación. | Pendiente para evolución posterior. |
| `correlation_id` pendiente | Falta trazabilidad end-to-end. | Retomar en sesión posterior. |

## Criterio de aprobación de la Sesión 16

La sesión queda aprobada si el estudiante demuestra que:

1. `EntregaCompletada` no debe perderse si es crítico para negocio;
2. at-least-once puede duplicar mensajes;
3. el consumidor idempotente evita duplicar efectos;
4. `eventId` ayuda, pero no alcanza solo;
5. el estado de negocio protege contra duplicados semánticos;
6. la integridad de misión/orden/dron se valida antes de modificar estado.
