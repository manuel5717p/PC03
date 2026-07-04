# Laboratorio Sesión 15 — Timeout, Retry, Backoff e Idempotencia

En esta sesión el estudiante valida que AURA aplica una política básica de resiliencia en la interacción **Centro de Logística → Planificador de Rutas**, simulando fallos y evitando crear misiones duplicadas para una misma orden de entrega.

> Logro de la sesión: el estudiante define e implementa en Node.js una política básica de timeout, retry, backoff e idempotencia para la interacción Centro de Logística → Planificador de Rutas, simulando fallos y evitando la creación duplicada de misiones para una misma orden de entrega.

## Traducción al repo actual

Los nombres del enunciado pueden aparecer en inglés, pero en este repo usamos estos equivalentes:

| Enunciado | Repo actual |
|---|---|
| `logistics-center` | `services/centro-logistica` |
| `route-planner` | `services/planificador-rutas` |
| `client.js` de simulación | no existe como ejecutable en este repo; se reemplaza por pruebas automatizadas en `services/centro-logistica/test/api.test.js` y llamadas HTTP contra `centro-logistica` |
| misión / route plan | orden con `route_plan` asociado |

IMPORTANTE: actualmente no existe `services/logistics-center/src/client.js`. Tampoco se debe ejecutar directamente `services/centro-logistica/src/route-planner-client.js`, porque ese archivo es un **módulo interno**, no un cliente CLI. La validación formal de laboratorio se hace con `npm test` y, para demostración manual, con `curl` contra `centro-logistica`.

El archivo que implementa la política técnica es:

```text
services/centro-logistica/src/route-planner-client.js
```

Pero los escenarios se ejecutan desde:

```text
services/centro-logistica/test/api.test.js
```

## Estado de cobertura de los escenarios

| Escenario | Estado en el repo | Evidencia actual |
|---|---|---|
| 1. Camino feliz | Cubierto | Test `crea orden y la lista` + prueba manual con `POST /api/v1/orders`. |
| 2. Servicio lento | Cubierto | Test `reintenta con backoff cuando planificador-rutas excede timeout`. |
| 3. Planificador no disponible | Cubierto | Test `no persiste orden cuando planificador-rutas falla definitivamente`. |
| 4. Zona inválida | Cubierto | Test `no reintenta ni persiste orden cuando planificador-rutas rechaza zona inválida`. El endpoint propaga `422` no retryable sin persistir orden. |
| 5. Doble solicitud con misma `Idempotency-Key` | Cubierto | Test `idempotency-key evita duplicar una orden repetida`. |

## Política técnica esperada

| Campo | Decisión recomendada |
|---|---|
| Timeout | Toda llamada a `planificador-rutas` debe tener límite de espera por intento (`ROUTE_PLANNER_TIMEOUT_MS`). |
| Retry | Reintentar solo errores transitorios: timeout, `408`, `429` y `5xx`. |
| Backoff | Esperar antes de cada reintento para no saturar más al planificador; PC02 usa backoff exponencial con jitter. |
| Error no retryable | No reintentar errores de negocio como zona inválida, destino no alcanzable o payload inválido. |
| Idempotencia | Usar `Idempotency-Key` para que repetir la misma intención no cree otra misión/orden. |
| Persistencia segura | Crear la orden solo después de obtener una ruta válida. Si el resultado es incierto o fallido, no crear una misión a ciegas. |
| Estado ante incertidumbre | Mantener la orden pendiente o consultar estado antes de crear otra misión. En el repo actual, si falla la planificación, la orden no se crea y se responde error controlado. |

## Preparación

Desde la raíz del proyecto:

```bash
node --version
npm --version
```

Si falta instalar dependencias, ejecutá `npm install` dentro del servicio correspondiente.

## Configuración obligatoria para prueba manual

El Centro de Logística necesita saber dónde está el Planificador de Rutas.

Si ejecutás con Docker Compose, `docker-compose.yml` ya configura:

```text
PLANIFICADOR_RUTAS_URL=http://planificador-rutas:8000
ROUTE_PLANNER_TIMEOUT_MS=500
ROUTE_PLANNER_RETRIES=2
ROUTE_PLANNER_BACKOFF_MS=100
```

El valor por defecto del cliente apunta al nombre de servicio de Docker Compose. Si ejecutás servicios manualmente en terminales separadas, sobrescribí la URL local así:

```bash
cd services/centro-logistica
PLANIFICADOR_RUTAS_URL=http://127.0.0.1:8003 \
ROUTE_PLANNER_TIMEOUT_MS=500 \
ROUTE_PLANNER_RETRIES=2 \
ROUTE_PLANNER_BACKOFF_MS=100 \
npm start
```

Si esta URL no está bien configurada, el Escenario 1 devuelve `503` con `attempts: 3`, porque `centro-logistica` agota los retries intentando contactar al planificador.

## Validación rápida antes de simular escenarios

Ejecutá regresión completa:

```bash
cd services/centro-logistica && npm test
cd ../planificador-rutas && npm test
cd ../monitor-telemetria && npm test
cd ../gestor-flota && npm test
```

Resultado esperado:

| Servicio | Resultado esperado |
|---|---|
| `centro-logistica` | Suite completa pasando |
| `planificador-rutas` | Suite completa pasando |
| `monitor-telemetria` | Suite completa pasando |
| `gestor-flota` | Suite completa pasando |

## Escenario 1 — Camino feliz

**Intención:** comprobar que la política de resiliencia no rompe el flujo normal.

### Ejecución automatizada

```bash
cd services/centro-logistica
npm test
```

Test relacionado:

```text
crea orden y la lista
```

### Ejecución manual equivalente

Levantá servicios:

```bash
docker compose up --build
```

Antes de enviar la orden, verificá que ambos servicios respondan:

```bash
curl -i http://localhost:8002/health
curl -i http://localhost:8003/health
```

Ambos deben responder HTTP `200`.

En otra terminal:

```bash
curl -i -X POST http://localhost:8002/api/v1/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: route-plan:order_urban_001:Drone-Alpha-1' \
  -d '{
    "pickup_location": { "latitude": -34.6037, "longitude": -58.3816 },
    "destination": { "latitude": -34.6158, "longitude": -58.4333 }
  }'
```

### Resultado esperado

Conceptualmente:

```text
SUCCESS
status: ROUTE_PLANNED
idempotentReplay: false
```

En el repo actual:

- HTTP `201`;
- respuesta con `route_plan`;
- `route_planner_attempts: 1`;
- la orden aparece en `GET /api/v1/orders`;
- no hay duplicación.

## Escenario 2 — Servicio lento

**Intención:** comprobar que una respuesta lenta dispara timeout y que el sistema no crea otra misión a ciegas.

### Comando conceptual del enunciado

```bash
FAILURE_MODE=slow node services/logistics-center/src/client.js
```

No ejecutes ese comando en este repo: `services/logistics-center/src/client.js` no existe. Su equivalente validable es el test automatizado indicado abajo.

Resultado conceptual esperado:

```text
PENDING
reason: TIMEOUT_UNCERTAIN
```

### Ejecución en el repo actual

```bash
cd services/centro-logistica
npm test
```

Test relacionado:

```text
reintenta con backoff cuando planificador-rutas excede timeout
```

### Resultado esperado

- el primer intento excede el timeout configurado;
- el cliente interno aborta ese intento;
- aplica backoff;
- reintenta;
- si el reintento obtiene ruta, crea la orden una sola vez;
- si todos los intentos fallaran, no debería crear una misión a ciegas.

Decisión correcta:

> El Centro de Logística no debe crear otra misión a ciegas. Debe consultar estado o mantener la orden en estado pendiente. En la implementación actual, ante falla final no persiste la orden, evitando efecto parcial.

## Escenario 3 — Planificador no disponible

**Intención:** comprobar que hay retries con backoff y que no se persiste una orden sin ruta.

### Comando conceptual del enunciado

```bash
FAILURE_MODE=unavailable node services/logistics-center/src/client.js
```

No ejecutes ese comando en este repo: `services/logistics-center/src/client.js` no existe. Su equivalente validable es el test automatizado indicado abajo.

Resultado conceptual esperado:

```text
Retries con backoff
Luego PENDING o RETRY_EXHAUSTED
```

### Ejecución en el repo actual

```bash
cd services/centro-logistica
npm test
```

Test relacionado:

```text
no persiste orden cuando planificador-rutas falla definitivamente
```

### Resultado esperado

- el stub del planificador responde `503` siempre;
- `centro-logistica` configura `retries: 2`;
- se observan `3` intentos en total;
- el endpoint responde `503`;
- `GET /api/v1/orders` devuelve lista vacía;
- no se duplicó ni se creó una misión incompleta.

Decisión correcta:

> Reintentar sin backoff puede saturar más al Planificador de Rutas. Por eso se reintenta de forma controlada y se corta sin persistir si se agotan los intentos.

## Escenario 4 — Zona inválida

**Intención:** comprobar que errores de negocio no se reintentan.

### Comando conceptual del enunciado

```bash
FAILURE_MODE=invalid_zone node services/logistics-center/src/client.js
```

No ejecutes ese comando en este repo: `services/logistics-center/src/client.js` no existe. Su equivalente validable es el test automatizado indicado abajo.

Resultado conceptual esperado:

```text
FAILED
reason: NON_RETRYABLE_ERROR
status: 422
```

### Ejecución en el repo actual

```bash
cd services/centro-logistica
npm test
```

Test relacionado:

```text
no reintenta ni persiste orden cuando planificador-rutas rechaza zona inválida
```

### Estado en el repo actual

La política interna y el endpoint público distinguen errores retryables y no retryables:

- retryables: timeout, `408`, `429`, `5xx`;
- no retryables: errores `4xx` distintos de `408` y `429`.

Cuando `planificador-rutas` responde `422` por zona inválida, `POST /api/v1/orders` responde `422`, no reintenta y no persiste la orden.

### Resultado esperado para aprobar conceptualmente

- no hay retries ante zona inválida;
- se informa error de negocio;
- no se crea orden/misión;
- se responde `422` o equivalente de error no retryable.

Decisión correcta:

> No tiene sentido reintentar si el destino no es alcanzable por reglas de negocio.

## Escenario 5 — Doble solicitud con misma Idempotency-Key

**Intención:** demostrar que repetir la misma intención no duplica la misión.

Clave recomendada:

```text
route-plan:order_urban_001:Drone-Alpha-1
```

### Ejecución automatizada

```bash
cd services/centro-logistica
npm test
```

Test relacionado:

```text
idempotency-key evita duplicar una orden repetida
```

### Ejecución manual equivalente

Ejecutá dos o más veces el mismo request:

```bash
curl -i -X POST http://localhost:8002/api/v1/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: route-plan:order_urban_001:Drone-Alpha-1' \
  -d '{
    "pickup_location": { "latitude": -34.6037, "longitude": -58.3816 },
    "destination": { "latitude": -34.6158, "longitude": -58.4333 }
  }'
```

Validá el listado:

```bash
curl -i http://localhost:8002/api/v1/orders
```

### Resultado esperado

Conceptualmente:

```text
Primera vez: crea ruta
Segunda vez: devuelve la misma ruta
idempotentReplay: true
```

En el repo actual:

- primera llamada: HTTP `201`;
- segunda llamada: HTTP `200`;
- ambas respuestas usan el mismo `id`;
- la segunda respuesta incluye `idempotent_replay: true`;
- el listado mantiene una sola orden para esa clave.

Decisión correcta:

> La idempotencia evita duplicar la intención de negocio: planificar la misma ruta para la misma orden y dron.

## Bitácora de laboratorio esperada

El estudiante debe entregar una tabla como esta:

| Escenario | Resultado observado | ¿Hubo retry? | ¿Se duplicó misión? | Decisión correcta |
|---|---|---|---|---|
| Camino feliz | | No | No | Crear ruta y persistir una sola orden. |
| Servicio lento | | Sí, si excede timeout | No | No crear otra misión a ciegas; mantener pendiente o recuperar con retry. |
| Planificador no disponible | | Sí, con backoff | No | Agotar retries y no persistir orden incompleta. |
| Zona inválida | | No | No | Fallar como error no retryable. |
| Doble solicitud misma clave | | No necesariamente | No | Devolver la misma intención ya procesada. |

## Checklist de cierre

- [ ] `centro-logistica` pasa `7/7` tests.
- [ ] Los cuatro servicios pasan sus pruebas de regresión.
- [ ] Se explica la política técnica de timeout, retry, backoff e idempotencia.
- [ ] Se evidencia que una falla definitiva no persiste órdenes incompletas.
- [ ] Se evidencia que repetir `Idempotency-Key` no duplica la misión.
- [ ] Se evidencia que el escenario `invalid_zone` responde `422` sin retry y sin persistir orden.

## Riesgos conocidos

| Riesgo | Impacto | Estado |
|---|---|---|
| Idempotencia en memoria | No sirve para múltiples réplicas o reinicios. | Aceptado para laboratorio. |
| Sin `client.js` de simulación | Los escenarios se prueban por tests y `curl`, no con `FAILURE_MODE=... node ...`; `route-planner-client.js` es módulo interno, no CLI. | Aceptado si el docente valida evidencia automatizada. |
| Zona inválida sin `422` final | El endpoint debe propagar errores de negocio no retryables. | Mitigado con test permanente para `422`. |
| Sin circuit breaker | Ante fallas sostenidas se depende de timeout/retry/backoff. | Pendiente futuro. |

## Criterio de aprobación de la Sesión 15

La sesión queda aprobada si el estudiante demuestra que:

1. el camino feliz crea una ruta y persiste una sola orden;
2. los timeouts no dejan el servicio colgado;
3. los retries usan backoff;
4. las fallas definitivas no generan órdenes fantasma;
5. la idempotencia evita duplicados;
6. los errores no retryables se reconocen como una categoría distinta de las fallas transitorias.
