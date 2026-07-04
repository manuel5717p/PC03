# Laboratorio Sesión 21 - Tiempo físico, skew, drift y límites de sincronización

> Resultado esperado: el estudiante puede explicar por qué los timestamps físicos ayudan a observar un sistema distribuido, pero no prueban orden global ni deben usarse ciegamente para medir duraciones o aceptar eventos.

Esta sesión inicia la Unidad 3 con un laboratorio determinístico en `monitor-telemetria`. No integra `centro-logistica` todavía: el foco es entender relojes, error y tolerancia antes de coordinar decisiones entre servicios.

## Objetivo

Demostrar cuatro riesgos concretos del tiempo físico en AURA:

| Riesgo | Qué debe aprender el estudiante |
|---|---|
| Wall-clock jump | Un reloj de pared puede saltar y romper cálculos de duración. |
| Skew/offset | Dos nodos pueden reportar tiempos distintos para eventos cercanos. |
| Drift | Un reloj puede alejarse progresivamente aun si alguna vez estuvo sincronizado. |
| Tolerance window | El servidor debe validar timestamps de cliente con una ventana explicita. |

## Conceptos clave

| Concepto | Definición operativa |
|---|---|
| Wall-clock | Hora calendario visible para humanos, NTP, logs y metadatos. Puede saltar hacia adelante o atrás. |
| Monotonic clock | Reloj para medir duraciones. Siempre avanza dentro del proceso y no depende de ajustes de hora calendario. |
| Skew u offset | Diferencia entre el reloj de un nodo y el reloj de referencia observado por el servidor. |
| Drift | Cambio acumulado del skew a lo largo del tiempo. La sincronización no queda garantizada para siempre. |
| Tolerance window | Margen maximo aceptado para confiar parcialmente en un timestamp de cliente. |
| Límite de sincronización | En un sistema distribuido no existe una prueba perfecta de orden global usando solo relojes físicos. |

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
| Base normal | `npm run lab:physical-time -- --normal` | Metadatos de evento con offsets pequeños y duración monotónica correcta. |
| Skew | `npm run lab:physical-time -- --skew` | `clientReportedAt` puede invertir el orden real de llegada. |
| Drift | `npm run lab:physical-time -- --drift` | El error crece tick a tick aunque el nodo siga funcionando. |
| Tolerancia | `npm run lab:physical-time -- --tolerance` | Algunos timestamps se aceptan y otros se rechazan según el threshold. |

También se aceptan alias posicionales:

```bash
npm run lab:physical-time -- skew
npm run lab:physical-time -- drift
npm run lab:physical-time -- tolerance
```

## Escenario 1 - Wall-clock vs monotonic

### Ejecución

```bash
npm run lab:physical-time -- --normal
```

### Resultado esperado

La salida muestra una duración real de `250 ms`, un salto del wall-clock de `-600 ms`, una duración por wall-clock negativa y una duración monotónica correcta.

```text
Wall-clock vs monotonic duration
- Real duration: 250 ms
- Wall-clock jump: -600 ms
- Duration measured with wall clock: -350 ms
- Duration measured with monotonic clock: 250 ms
```

### Interpretación

El wall-clock sirve para decir “cuándo” ocurrió algo en términos humanos. No sirve como base confiable para medir cuánto duró una operación. Para timeouts, latencias y duraciones se usa tiempo monotónico.

## Escenario 2 - Skew y orden aparente

### Ejecución

```bash
npm run lab:physical-time -- --skew
```

### Resultado esperado

La salida compara el orden real observado por el servidor con el orden si alguien ordena por `clientReportedAt`.

```text
Events by actual server order:
- evt-physical-001 -> evt-physical-002 -> evt-physical-003
Events by clientReportedAt:
- evt-physical-002 -> evt-physical-001 -> evt-physical-003
```

### Interpretación

El cliente `evt-physical-002` reporta una hora más antigua porque su reloj está atrasado. Si el sistema ordena solo por timestamp de cliente, puede reconstruir una historia falsa.

## Escenario 3 - Drift acumulado

### Ejecución

```bash
npm run lab:physical-time -- --drift
```

### Resultado esperado

Cada tick aumenta el `skew` del nodo.

```text
- tick 1: ... skew=5ms errorGrowth=0ms
- tick 2: ... skew=17ms errorGrowth=12ms
- tick 3: ... skew=29ms errorGrowth=24ms
```

### Interpretación

Sincronizar una vez no alcanza. Entre sincronizaciones, los relojes derivan. Por eso los sistemas reales hablan de error máximo, precisión esperada y ventanas de tolerancia, no de certeza absoluta.

## Escenario 4 - Ventana de tolerancia

### Ejecución

```bash
npm run lab:physical-time -- --tolerance
```

### Resultado esperado

Con una ventana de `+/- 100 ms`, los eventos con skew `20 ms` y `-85 ms` se aceptan; los eventos con `140 ms` y `-160 ms` se rechazan.

```text
Tolerance window: +/- 100 ms
Accepted: 2
Rejected: 2
```

### Interpretación

El servidor no debe confiar ciegamente en `clientReportedAt`. Puede guardarlo como evidencia, pero debe comparar contra `serverReceivedAt`, calcular `clockSkewMs` y decidir si entra o no en la ventana permitida.

## Metadatos prácticos del evento

Cada evento del laboratorio incluye:

| Campo | Uso |
|---|---|
| `eventId` | Identificador único del evento. |
| `correlationId` | Agrupa eventos de una misma operacion o flujo. |
| `nodeId` | Nodo que reporta el timestamp. |
| `clientReportedAt` | Hora que el cliente afirma haber observado. |
| `serverReceivedAt` | Hora en que el servidor recibió el evento. |
| `clockSkewMs` | Diferencia calculada entre cliente y servidor. |
| `acceptedWithinTolerance` | Decisión local según la ventana configurada. |

## Preguntas para responder

1. ¿Por qué una duración calculada con wall-clock puede ser negativa?
2. ¿Qué evidencia muestra que `clientReportedAt` no prueba orden global?
3. ¿Cómo cambia el error cuando aparece drift?
4. ¿Qué valor de negocio tiene guardar `clockSkewMs` junto al evento?
5. ¿Qué debería hacer AURA con un evento fuera de tolerancia: rechazarlo, marcarlo como sospechoso o procesarlo con menor confianza?

## Advertencias que deben quedar claras

- Los timestamps físicos no prueban orden global en un sistema distribuido.
- Los timestamps de cliente no se deben confiar ciegamente.
- Las duraciones, timeouts y latencias deben medirse con reloj monotónico.
- Una ventana de tolerancia reduce riesgo, pero no elimina el límite teórico de sincronización.

## Cierre

Esta sesión prepara el terreno para la Sesión 22: sincronización de relojes. El punto no es abandonar el tiempo físico, sino entender primero sus errores; en la siguiente sesión se estudiará cómo estimar y corregir esos errores sin confundir sincronización con orden global perfecto.
