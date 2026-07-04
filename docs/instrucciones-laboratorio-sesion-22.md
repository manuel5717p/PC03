# Laboratorio Sesión 22 - Sincronización de relojes: visión general y efectos

> Resultado esperado: el estudiante puede explicar cómo una sincronización tipo NTP estima `offset` y `round-trip delay`, por qué la asimetría de red sesga la estimación y cómo usar `confidence`/`tolerance` sin confundir sincronización con orden global perfecto.

La Sesión 22 continúa directamente la Sesión 21. En la sesión anterior se demostró que el tiempo físico tiene `skew`, `drift` y ventanas de tolerancia. Ahora se estudia qué mejora la sincronización de relojes y qué límites conserva en un sistema distribuido como AURA.

## Relación con la Sesión 21

| Sesión | Pregunta central | Resultado |
|---|---|---|
| 21 | ¿Qué sale mal si confío ciegamente en timestamps físicos? | Se observan wall-clock jumps, skew, drift y tolerancia. |
| 22 | ¿Cómo estimo y corrijo parte del error del reloj? | Se calculan offset, delay, sesgo por asimetría, corrección y confianza. |
| 23 | ¿Cómo razono sobre orden parcial sin depender solo de hora física? | Se estudiarán relojes de Lamport. |

## Conceptos clave

| Concepto | Definición operativa |
|---|---|
| Sincronización de relojes | Proceso para estimar la diferencia entre relojes y reducir el error observado. |
| `offset` | Diferencia estimada entre el reloj local y un reloj de referencia. |
| `roundTripDelayMs` | Tiempo total de ida y vuelta descontando el procesamiento remoto: `(t3 - t0) - (t2 - t1)`. |
| `estimatedOffsetMs` | Estimación tipo NTP: `((t1 - t0) + (t2 - t3)) / 2`. |
| Delay asimétrico | Caso donde ida y vuelta no tardan lo mismo; el algoritmo puede interpretar latencia como offset. |
| `step` | Corrección abrupta: el reloj salta al valor corregido. |
| `slew` | Corrección gradual: el reloj se ajusta en varios ticks. |
| Sincronización stale | Resultado de sincronización viejo; el drift acumulado aumenta el error estimado. |
| `confidence` y `tolerance` | Metadatos para decidir si un timestamp sirve para ordenar, auditar o evaluar ventanas SLA. |

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
| Base normal | `npm run lab:clock-sync -- --normal` | Cuatro timestamps tipo NTP con delay simétrico y estimación exacta. |
| Delay asimétrico | `npm run lab:clock-sync -- --asymmetric-delay` | La estimación de offset queda sesgada por latencias distintas. |
| Política de corrección | `npm run lab:clock-sync -- --correction-policy` | Diferencia entre corregir con `step` y corregir con `slew`. |
| Sync stale | `npm run lab:clock-sync -- --stale-sync` | El drift desde la última sync aumenta el error y reduce la confianza. |
| Impacto en telemetría | `npm run lab:clock-sync -- --telemetry-impact` | Metadatos que deciden si un evento es confiable para ordering, SLA o auditoría. |
| Análisis de escenarios | `npm run lab:clock-sync -- --scenario-analysis` | Casos AURA donde NTP reduce incertidumbre, pero no prueba causalidad. |

También se aceptan alias posicionales:

```bash
npm run lab:clock-sync -- asymmetric-delay
npm run lab:clock-sync -- correction-policy
npm run lab:clock-sync -- stale-sync
npm run lab:clock-sync -- telemetry-impact
npm run lab:clock-sync -- scenario-analysis
```

## Escenario 1 - Intercambio normal tipo NTP

### Ejecución

```bash
npm run lab:clock-sync -- --normal
```

### Resultado esperado

La salida muestra los cuatro timestamps `t0`, `t1`, `t2`, `t3`, el `roundTripDelayMs`, el `estimatedOffsetMs`, el `trueOffsetMs` y el `estimationBiasMs`.

```text
NTP-style four timestamps
- roundTripDelayMs = 80 ms
- estimatedOffsetMs = 80 ms
- trueOffsetMs = 80 ms
- estimationBiasMs = 0 ms
```

### Interpretación

Con delay simétrico, el algoritmo reparte la latencia de ida y vuelta en dos mitades iguales. En ese escenario controlado, la estimación coincide con el offset real.

## Escenario 2 - Delay asimétrico

### Ejecución

```bash
npm run lab:clock-sync -- --asymmetric-delay
```

### Resultado esperado

La ida y la vuelta no tardan lo mismo. El offset real sigue siendo `80 ms`, pero la estimación baja a `40 ms`.

```text
- roundTripDelayMs = 120 ms
- estimatedOffsetMs = 40 ms
- trueOffsetMs = 80 ms
- estimationBiasMs = -40 ms
```

### Interpretación

El algoritmo no puede observar por separado cuánto tardó cada tramo si solo tiene los cuatro timestamps. Cuando la red es asimétrica, parte de la latencia se confunde con diferencia de reloj.

## Escenario 3 - Política de corrección: step vs slew

### Ejecución

```bash
npm run lab:clock-sync -- --correction-policy
```

### Resultado esperado

`step` corrige el offset completo en un solo tick. `slew` reparte la corrección en varios ticks.

```text
Step correction
- tick 0: offset=120ms appliedCorrection=0ms
- tick 1: offset=0ms appliedCorrection=-120ms
Slew correction
- tick 0: offset=120ms appliedCorrection=0ms
- tick 1: offset=90ms appliedCorrection=-30ms
- tick 2: offset=60ms appliedCorrection=-30ms
- tick 3: offset=30ms appliedCorrection=-30ms
- tick 4: offset=0ms appliedCorrection=-30ms
```

### Interpretación

`step` es rápido, pero puede producir saltos visibles en logs y ordenamientos por timestamp. `slew` tarda más, pero evita un cambio brusco del reloj.

## Escenario 4 - Sincronización stale

### Ejecución

```bash
npm run lab:clock-sync -- --stale-sync
```

### Resultado esperado

El laboratorio calcula `driftSinceLastSyncMs`, `syncAgeMs`, `estimatedErrorMs`, `confidence` y `toleranceMs`.

```text
- syncAgeMs: 90000 ms
- estimatedErrorMs: 19.2 ms
- confidence: 0.616
```

### Interpretación

Un dato de sincronización envejece. A mayor tiempo desde la última sync, mayor error estimado y menor confianza. El sistema no debería guardar solo `clockOffsetMs`; también necesita edad y error esperado.

## Escenario 5 - Impacto en telemetría

### Ejecución

```bash
npm run lab:clock-sync -- --telemetry-impact
```

### Resultado esperado

La salida muestra metadatos de confianza para diferentes usos operativos.

```text
- clockOffsetMs: 18 ms
- roundTripDelayMs: 40 ms
- syncAgeMs: 15000 ms
- confidence: 0.9
- toleranceMs: 50 ms
- trustedForOrdering: true
- trustedForSlaWindow: true
- trustedForAuditTimeline: true
```

### Interpretación

No todos los usos exigen la misma precisión. Ordenar eventos cercanos requiere más confianza que ubicar un evento en una línea de auditoría aproximada. La decisión debe quedar explícita en metadatos, no escondida en una suposición.

## Preguntas para responder

1. ¿Qué representan `t0`, `t1`, `t2` y `t3` en un intercambio tipo NTP?
2. ¿Por qué `roundTripDelayMs` descuenta `(t2 - t1)`?
3. ¿Qué evidencia muestra que el delay asimétrico sesga el `estimatedOffsetMs`?
4. ¿Cuándo preferirías `step` y cuándo `slew` en AURA?
5. ¿Por qué `syncAgeMs` debe viajar junto con `clockOffsetMs`?
6. ¿Qué diferencia hay entre confiar en un timestamp para SLA y confiar en él para ordenar eventos?

## Caso AURA: análisis guiado de escenarios

### Propósito

NTP reduce la incertidumbre de los relojes físicos, pero no prueba causalidad por sí mismo. Al finalizar esta actividad, el estudiante debe poder defender esta idea: sincronizar relojes mejora la precisión del tiempo observado, pero no alcanza para afirmar qué evento causó a otro ni para reconstruir un orden total exacto cuando los eventos quedan dentro del margen de error.

### Ruta de trabajo secuencial

1. Ejecuta primero el laboratorio normal de sincronización si todavía no observaste `offset`, `roundTripDelayMs` y `estimatedOffsetMs`.
2. Ejecuta el análisis de escenarios desde `services/monitor-telemetria`.
3. Lee el caso base de AURA antes de mirar cada escenario.
4. Para cada escenario, compara los datos observados con el margen de incertidumbre, el riesgo operacional y la política recomendada.
5. Responde usando evidencia breve en la tabla de respuesta. No alcanza con decir “sí” o “no”: cada respuesta debe citar un dato del escenario.

Comando opcional de repaso del intercambio normal:

```bash
npm run lab:clock-sync -- --normal
```

Comando del caso guiado:

```bash
npm run lab:clock-sync -- --scenario-analysis
```

También puedes visualizar este mismo caso en la plataforma educativa de observabilidad:

```bash
cd ../observability-platform
npm start
```

Abre `http://localhost:8010` y ejecuta el análisis de escenarios para ver ventanas de incertidumbre, decisiones y JSON estructurado.

### Situación base

AURA opera varios drones durante una campaña de alta demanda. En una ventana muy corta se observan estos eventos:

| Hora reportada | Evento |
|---|---|
| `10:20:00.100` | `Drone-Alpha-1` reporta batería en `12%`. |
| `10:20:00.050` | Centro Logístico asigna nueva misión a `Drone-Alpha-1`. |
| `10:20:00.300` | Gestor de Flota marca el drone como `AVAILABLE`. |
| `10:20:00.180` | Monitor de Telemetría recibe alerta crítica. |

Propuesta rápida para desafiar: “Sincronizamos todos los relojes con NTP y queda resuelto”.

Pregunta central: ¿sincronizar relojes alcanza para saber con certeza qué causó qué?

Antes de responder, usa siempre estos cuatro lentes:

| Lente | Qué debes revisar |
|---|---|
| Datos observados | Timestamps, diferencia temporal, llegada, procesamiento o duración reportada. |
| Margen de incertidumbre | Error estimado, tolerancia o drift que puede cambiar la interpretación. |
| Riesgo operacional | Qué daño produce decidir mal en AURA. |
| Política recomendada | Qué debe hacer el sistema cuando la evidencia no alcanza. |

### Plantilla de respuesta

Completa una fila por escenario después de ejecutar el comando y leer los datos:

| Escenario | Evidencia observada | ¿Se puede establecer certeza? | Riesgo operacional | Política recomendada para AURA | Concepto reforzado |
|---|---|---|---|---|---|
| A - Batería baja vs misión |  |  |  |  |  |
| B - Telemetría fuera de orden |  |  |  |  |  |
| C - Auditoría de incidente |  |  |  |  |  |
| D - SLA de entrega |  |  |  |  |  |
| E - Timestamp futuro |  |  |  |  |  |

### Escenario A - Batería baja vs asignación de misión

| Dato | Valor |
|---|---|
| `BatteryLow.occurredAt` | `10:20:00.100` |
| `MissionAssigned.processedAt` | `10:20:00.130` |
| Error estimado de reloj | `±80 ms` |
| Diferencia observada | `30 ms` |

Qué debes probar/observar en la salida:

- `differenceMs`
- `estimatedErrorMs`
- `canEstablishTemporalOrder`
- `decision`

Preguntas de análisis:

1. ¿Podemos afirmar que `BatteryLow` ocurrió antes que `MissionAssigned`?
2. ¿La diferencia temporal supera el margen de error?
3. ¿Cuál es el riesgo operacional si AURA asigna igual la misión?
4. ¿Qué debería hacer AURA antes de asignar la misión?

Criterio orientador:

| Si observas... | Entonces razona... |
|---|---|
| Diferencia temporal menor que el margen de error | El timestamp físico no alcanza para afirmar orden con certeza. |
| Evento de seguridad crítico | La política debe ser conservadora, no optimista. |
| Decisión operacional riesgosa | Se necesita confirmación fresca, safety gate o marca explícita de incertidumbre. |

Discusión esperada: NTP redujo el error, pero no eliminó la incertidumbre. El sistema debe tratar este caso como una decisión operacional riesgosa, no como una comparación simple de timestamps.

### Escenario B - Telemetría fuera de orden

| Packet | `occurredAt` | `receivedAt` | Batería |
|---|---|---|---:|
| `P1` | `10:20:00.100` | `10:20:00.300` | `60` |
| `P2` | `10:20:00.200` | `10:20:00.400` | `59` |
| `P3` | `10:19:59.900` | `10:20:01.000` | `62` |

Preguntas de análisis:

1. ¿Qué packet llegó tarde?
2. ¿Cuál tiene el timestamp de evento más antiguo?
3. ¿Debe descartarse automáticamente por llegar tarde?
4. ¿Qué política encaja mejor con telemetría frecuente?

Qué debes probar/observar en la salida:

- qué packet llega tarde;
- qué packet queda primero al ordenar por `occurredAt`;
- qué valor muestra `outOfOrder`;
- qué orden aparece en `eventTimeOrder`.

Criterio orientador:

| Si observas... | Entonces razona... |
|---|---|
| Un packet llega después pero tiene `occurredAt` más antiguo | Llegada tardía y orden de evento no son lo mismo. |
| Telemetría frecuente | No conviene descartar automáticamente solo por llegar tarde. |
| Estado operacional ya actualizado | Conviene marcar stale/out-of-order y evitar sobrescribir estado más nuevo sin regla explícita. |

Discusión esperada: llegada tardía no equivale a dato inválido. Puede servir para auditoría o corrección, pero no debe pisar el estado operacional más reciente sin una regla clara.

### Escenario C - Auditoría de incidente

Todos los servicios usan NTP, pero el error estimado es `±100 ms`.

| Servicio | Timestamp | Evento |
|---|---|---|
| `centro-logistica` | `10:30:00.100` | `MissionAssigned` |
| `gestor-flota` | `10:30:00.050` | `DroneAvailable` |
| `monitor-telemetria` | `10:30:00.020` | `BatteryLow` |
| `planificador-rutas` | `10:30:00.090` | `RoutePlanned` |

Preguntas de análisis:

1. ¿Podemos reconstruir el orden exacto de los eventos?
2. ¿Qué eventos están demasiado cerca entre sí?
3. ¿Qué metadatos adicionales ayudarían?
4. ¿Cuál es el límite de una auditoría basada solo en tiempo físico?

Qué debes probar/observar en la salida:

- `exactTotalOrderTrusted`;
- cantidad de pares demasiado cercanos en `tooClosePairs`;
- lista de `recommendedMetadata`.

Criterio orientador:

| Si observas... | Entonces razona... |
|---|---|
| Eventos dentro del margen estimado | La línea de tiempo por timestamp puede ser plausible, pero no necesariamente verdadera. |
| Auditoría necesita causalidad | Se requieren identificadores causales, trazas, secuencias locales y timestamps de recepción/procesamiento. |
| Solo existe tiempo físico | La auditoría puede ubicar ventanas, no demostrar causa. |

Discusión esperada: la auditoría debe combinar tiempo físico con trazabilidad causal. Si solo ordenamos por timestamp, podemos construir una historia falsa pero convincente.

### Escenario D - SLA de entrega

| Dato | Valor |
|---|---|
| `MissionStarted.occurredAt` | `10:00:00` |
| `DeliveryCompleted.occurredAt` | `10:29:58` |
| `DeliveryCompleted.receivedAt` | `10:31:10` |
| `DeliveryCompleted.processedAt` | `10:31:30` |
| SLA prometido | `30 minutos` |

Preguntas de análisis:

1. ¿La entrega cumplió el SLA?
2. ¿Qué timestamp se usa para el SLA de negocio?
3. ¿Qué timestamp se usa para monitoreo operacional?
4. ¿Qué timestamp ayuda a detectar demora de procesamiento?

Qué debes probar/observar en la salida:

- `businessSlaTimestamp`;
- `businessDurationMs`;
- `metBusinessSla`;
- `ingestionDelayMs` y `processingDelayMs`.

Criterio orientador:

| Si observas... | Entonces razona... |
|---|---|
| Duración calculada con el hecho de negocio | Evalúa el SLA prometido al cliente si el timestamp es confiable. |
| Diferencia entre recepción y procesamiento | Mide salud del pipeline, no duración real de la entrega. |
| Timestamps con propósitos distintos | No mezcles SLA de negocio con latencia de ingesta o procesamiento. |

Discusión esperada: el SLA de entrega mide el hecho de negocio, no cuándo el backend recibió o procesó la notificación. Esos timestamps son valiosos, pero responden otra pregunta.

### Escenario E - Falso timeout por reloj local

Un servicio calcula la edad de un mensaje usando su reloj local. El drone tiene drift de `+2 segundos`.

| Dato | Valor |
|---|---|
| `Drone.occurredAt` | `10:40:05` |
| Hora actual del backend | `10:40:03` |
| Efecto observado | El backend ve un evento “del futuro”. |

Preguntas de análisis:

1. ¿Qué problema aparece al calcular edad con relojes físicos distintos?
2. ¿El evento debe considerarse inválido automáticamente?
3. ¿Qué política conviene para timestamps futuros?
4. ¿Qué rol cumple la sincronización?

Qué debes probar/observar en la salida:

- `futureByMs`;
- `withinFutureTolerance`;
- `invalid`.

Criterio orientador:

| Si observas... | Entonces razona... |
|---|---|
| Timestamp levemente futuro | Puede ser drift/skew, no necesariamente fraude o corrupción. |
| Diferencia dentro de tolerancia | Aceptar con metadatos de incertidumbre y refrescar sincronización puede ser más correcto que rechazar. |
| Cálculo de duración local | Usa reloj monotónico; el wall-clock físico no es la herramienta correcta. |

Discusión esperada: un timestamp futuro puede ser señal de drift, no de fraude ni corrupción. La política debe distinguir entre tolerancia razonable, cuarentena y rechazo.

### Cierre de la actividad

La respuesta correcta no es “NTP lo arregla”. La respuesta correcta es: NTP reduce el margen de error, pero AURA todavía necesita políticas de incertidumbre, safety gates y metadatos causales para tomar decisiones defendibles.

## Advertencia importante

La sincronización estima y reduce error; no prueba orden global ni orden causal. Aunque `confidence` sea alto, dos eventos cercanos pueden quedar dentro del margen de error. El orden causal se trabajará en la Sesión 23 con relojes de Lamport.

## Cierre

La Sesión 22 deja a AURA con metadatos más defendibles para timestamps físicos: `clockOffsetMs`, `roundTripDelayMs`, `syncAgeMs`, `estimatedErrorMs`, `confidence` y `toleranceMs`. Ese avance mejora la observabilidad, pero no reemplaza relojes lógicos ni razonamiento causal.
