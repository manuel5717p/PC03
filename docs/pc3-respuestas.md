# PC3 - AURA Coordinación bajo Falla

## Datos del estudiante

| Campo | Detalle |
|---|---|
| Nombre | Miguel AngelArias Villanueva |
| Codigo | U22223307 |
| Unidad | Unidad 3: Tiempo, sincronización, causalidad y coordinación |
| Fecha | 2026-07-03 |

## Fase 1 - Tiempo físico y sincronización

### Corrección conceptual de timestamps

Cada servicio reporta wall-clock con skew conocido. Corrijo restando el skew (tiempo real estimado = reportado − skew), pero esta corrección **no es prueba causal**: sigue sujeta al error ±300 ms.

| Evento | Servicio | Reportado | Skew | Corregido estimado | Intervalo real posible (±300 ms) |
|---|---|---:|---:|---:|---|
| E1 `BatteryLow` 18% | monitor-telemetria | 10:15:00.300 | +400 ms | 10:14:59.900 | [10:14:59.600, 10:15:00.200] |
| E2 `MissionAssigned` | centro-logistica | 10:15:00.100 | −200 ms | 10:15:00.300 | [10:15:00.000, 10:15:00.600] |
| E3 `DroneAvailable` | gestor-flota | 10:15:00.250 | +100 ms | 10:15:00.150 | [10:14:59.850, 10:15:00.450] |
| E4 `BatteryCritical` 12% | monitor-telemetria | 10:15:00.500 | +400 ms | 10:15:00.100 | [10:14:59.800, 10:15:00.400] |

### Respuestas

**1. ¿Se puede afirmar que `MissionAssigned` (E2) ocurrió antes que `BatteryLow` (E1) solo por timestamp físico?**

No, con los timestaps previos ya reportados E2(10:15:00.100) pareciera que fue antes que E1(10:15:00.300). Si corregimos dichas diferencias aplicando el skew conocido tenemos ahora E2(10:15:00.300) y E1(10:14:59.900). Ahora el orden se invierte. Aún no podemos delegarlos como el orden real dado el datos adjunto de aproximación que existe como intervales reales de tiempo posible. Existe un cruce posible en los intervales de tiempo dandonos que cualquiera de los ordenes físicos en los eventos E(2) y E(1) pudo haber ocurrido. 


**2. ¿Qué riesgo operativo aparece si AURA ordena estos eventos solo por timestamp?**

Sólo siguiendo el orden de los eventos por timestamp cogiendo la pregunta 1 como referencia tendriamos que se llegara a asignar una mision a un dron con la bateria baja, aun habiendolo reportado dicha informacion. Ocasionando la incompletidud de la orden con riesgos como aterrizaje forzoso, perdida del paquete, accidentes en la zona que este transitando, etc. Adjutando problemas de auditoria falsas porque si bien todo parecia "correcto", detras no fue asi.  


**3. ¿Qué campos temporales deberían registrarse como mínimo?**

Wall-clock reportado; servicio emisor; skew conocido/estimado al momento de emisión; margen de error de sincronización; monotonic time o duración local para medir intervalos dentro del mismo proceso; correlation/trace id; id de evento y productor; y metadata causal (vector clock o al menos id del evento causante) cuando exista.

**4. ¿Qué decisión de negocio no debería depender solo del reloj físico?**

La asignación de misión a un dron en función del último estado de batería conocido (y en general cualquier resolución de conflicto "el evento más reciente gana"). Esa decisión requiere orden causal: el `MissionAssigned` debe demostrar que *conoció* (happened-after) la última telemetría de batería, no que tiene un timestamp mayor. Lo mismo aplica a expiración de locks y a detección de líderes: ahí el reloj sirve para *timeouts locales*, no para ordenar eventos entre nodos.

## Fase 2 - Vector clocks y causalidad

### Procedimiento

Orden `[P1, P2, P3]`, inicio `[0,0,0]`. Reglas: evento local incrementa componente propio; envío incrementa y adjunta; recepción hace máximo componente a componente y luego incrementa el componente receptor.

Cálculo paso a paso:

1. **a** (P1 local): P1 pasa de [0,0,0] a **[1,0,0]**.
2. **m1** (P1 envía): incrementa P1 → **[2,0,0]**; el mensaje viaja con [2,0,0].
3. **d** (P2 recibe m1): max([0,0,0],[2,0,0]) = [2,0,0]; incrementa P2 → **[2,1,0]**.
4. **b** (P1 local): [2,0,0] → **[3,0,0]**.
5. **m3** (P2 envía): incrementa P2 → **[2,2,0]**; el mensaje viaja con [2,2,0].
6. **e** (P2 local, decisión preliminar): **[2,3,0]**.
7. **f** (P3 recibe m3): max([0,0,0],[2,2,0]) = [2,2,0]; incrementa P3 → **[2,2,1]**.
8. **c** (P1 local, batería 12%): [3,0,0] → **[4,0,0]**.
9. **m2** (P3 envía): incrementa P3 → **[2,2,2]**; el mensaje viaja con [2,2,2].
10. **g** (P1 recibe m2): max([4,0,0],[2,2,2]) = [4,2,2]; incrementa P1 → **[5,2,2]**.

### Tabla de eventos

| # | Etiqueta | Proceso | Acción | Mensaje recibido | Vector resultante |
|---:|---|---|---|---|---|
| 1 | a | P1 | recibe telemetría batería 18% | - | [1,0,0] |
| 2 | m1 | P1 → P2 | envía `BatteryLowAlert` | - | [2,0,0] |
| 3 | d | P2 | recibe `BatteryLowAlert` | m1 | [2,1,0] |
| 4 | b | P1 | recibe telemetría GPS | - | [3,0,0] |
| 5 | m3 | P2 → P3 | solicita estado del dron | - | [2,2,0] |
| 6 | e | P2 | registra decisión preliminar de misión | - | [2,3,0] |
| 7 | f | P3 | recibe solicitud de estado | m3 | [2,2,1] |
| 8 | c | P1 | recibe telemetría batería 12% | - | [4,0,0] |
| 9 | m2 | P3 → P1 | envía estado actualizado | - | [2,2,2] |
| 10 | g | P1 | recibe estado actualizado | m2 | [5,2,2] |

### Comparaciones

| Comparación | Relación | Evidencia vectorial | Implicación para AURA |
|---|---|---|---|
| a vs d | `before` | [1,0,0] ≤ [2,1,0] con al menos un componente estrictamente menor | La recepción de la alerta conoció causalmente la lectura de batería 18%. Centro de Logística sí tenía evidencia de `BatteryLow` al momento de d. |
| d vs e | `before` | [2,1,0] ≤ [2,3,0], segundo componente 1 < 3 | La decisión preliminar se tomó *después* de conocer `BatteryLowAlert` (18%). Si aun así asignó la misión, fue una decisión informada respecto al 18%, no ignorancia. |
| b vs d | `concurrent` | [3,0,0] vs [2,1,0]: 3>2 pero 0<1, ninguna dirección domina | La telemetría GPS y la recepción de la alerta no tienen relación causal. AURA no puede asumir que la decisión usó la posición GPS más reciente. |
| c vs e | `concurrent` | [4,0,0] vs [2,3,0]: 4>2 pero 0<3 | **El riesgo central del incidente**: la decisión preliminar se tomó sin conocer `BatteryCritical` (12%). No es que ocurrió "antes" o "después": es información que nunca llegó a P2 antes de decidir. La misión pudo asignarse a un dron inviable. |
| f vs g | `before` | [2,2,1] ≤ [5,2,2], componentes 1 y 3 estrictamente menores | El estado que recibió P1 incorpora la solicitud de P2: la cadena m3→f→m2→g es causal y auditable. |
| e vs g | `concurrent` | [2,3,0] vs [5,2,2]: 3>2 en P2 pero 2<5 en P1 | El "estado actualizado" que recibió P1 **no refleja** la decisión preliminar de misión (y viceversa). Dos vistas del sistema divergentes coexisten: nadie tiene la foto completa. |

### Defensa

Lo defendible: e conoció la batería al 18% (d → e) pero **no** la batería al 12% (c ∥ e). Centro de Logística decidió con información causalmente incompleta, y ningún timestamp físico puede desmentirlo. Los pares concurrentes deben tratarse como "información no disponible al decidir", no reordenarse por reloj. La corrección operativa es que la decisión preliminar quede marcada como revisable hasta confirmar contra el último estado causalmente conocido del dron.

## Fase 3 - Locks, leases y fencing

### Diagnóstico

Asumo T0 = 0 ms como origen del timeline.

| Campo | Respuesta |
|---|---|
| `leaseDeadline` de LC1 | T0 + TTL = 0 + 3000 = **3000 ms**. LC1 se bloquea 4500 ms desde T2, así que despierta en T6 ≈ 4500+ ms > 3000 ms: el lease venció mientras dormía (T3). |
| Estado de LC1 en T7 | **Owner stale**: cree tener el lock pero su lease expiró y el lock fue readquirido por LC2 con fence=22. LC1 no puede demostrar ownership vigente. |
| Riesgo si se acepta la escritura de LC1 | Doble asignación: `Drone-Alpha-1` quedaría asignado a `M-2001` y `M-2002` a la vez. Dos misiones despachadas sobre un solo dron: colisión de planes de vuelo, entregas fallidas, inconsistencia de inventario y auditoría corrupta. |
| Comparación de fencing requerida | El recurso protegido guarda el mayor fence aceptado por dron y solo acepta escrituras con `fence > latestAcceptedFence`. Aquí: 21 > 22 es falso → rechazo. |
| Decisión segura sobre `M-2001` | **Rechazar la escritura de LC1** en el recurso protegido. La misión no se pierde: la escritura sí. |
| Compensación o revisión necesaria | `M-2001` vuelve a la cola de asignación para reintentarse con lock/fence nuevo sobre otro dron disponible (o el mismo si se libera). Si algún efecto lateral ya se ejecutó (reserva, notificación), disparar compensación idempotente y registrar el caso en revisión. |

### Conceptos obligatorios

| Concepto | Qué garantiza | Qué no garantiza | Riesgo si se omite |
|---|---|---|---|
| Lock | Exclusión mutua *mientras el sistema de locks está sano y el owner está vivo*. | Que el owner siga siendo válido tras pausas, GC o particiones; sin TTL puede quedar retenido para siempre. | Dos procesos operando el mismo dron; o deadlock permanente si el owner muere. |
| Lease con TTL | Liberación automática: el sistema avanza aunque el owner muera o se cuelgue. | Que el owner *sepa* que perdió el lease; el owner puede seguir ejecutando creyéndose dueño. | Exactamente este incidente: LC1 despierta y escribe después de expirar. |
| Renovación | Extiende el lease de un owner vivo y activo antes del deadline. | Nada si el proceso está pausado (no puede renovar); tampoco protege contra renovaciones que llegan tarde. | Operaciones legítimas largas pierden el lock a mitad de camino sin aviso. |
| Fencing token | Rechazo determinista de escrituras stale: el recurso solo acepta tokens crecientes, aunque el owner viejo esté convencido de su ownership. | No evita que el proceso stale *intente* la operación ni protege recursos que no validan el token. | Escritura de LC1 (fence 21) aceptada después de la de LC2 (fence 22): doble asignación. |
| Operación idempotente | Reintentos y compensaciones seguros: aplicar dos veces produce el mismo estado. | No previene escrituras stale ni resuelve el orden; solo hace inocuo el duplicado exacto. | Reintentos de `M-2001` crean asignaciones o cargos duplicados. |

### Decisión de flota

1. **No.** LC1 no puede demostrar ownership (lease vencido en T3) y su fence 21 es menor que el último aceptado (22). Ambas verificaciones, independientes, ordenan rechazar.
2. El recurso debe validar, antes de persistir: fence estrictamente mayor al último aceptado para ese dron; epoch/term del líder vigente; que el dron no esté ya asignado; e Idempotency-Key para absorber reintentos.
3. Auditoría: actor, misión, dron, fence presentado vs fence vigente, leaseDeadline vs now, epoch presentado vs vigente, decisión y razón, timestamp físico + monotonic + correlation id. Exactamente lo que emite el `auditLog` de la Fase 5.
4. **Reintentar con revisión**: rechazar la escritura stale, devolver `M-2001` a la cola para reasignación limpia y dejar registro en revisión si hubo efectos laterales previos al rechazo. Rechazar a secas pierde la misión; compensar sin reasignar tampoco entrega el paquete.

### Métricas mínimas

Intentos de adquisición de lock (tasa y latencia); expiraciones de lease (total y % sobre adquisiciones); operaciones rechazadas por fencing (por recurso y por actor); duración de operación crítica vs TTL (histograma; alerta si p99 > 0.8·TTL); renovaciones tardías o fallidas; escrituras de owners stale detectadas; compensaciones por doble asignación evitada. La métrica accionable clave es duración crítica vs TTL: en este incidente, una operación de 4500 ms contra un TTL de 3000 ms era una expiración anunciada.

## Fase 4 - Failure detector y elección de líder

### Failure detector

**1. ¿Qué puede afirmar RP2 sobre RP5 en T5?**
Solo que no ha recibido heartbeats de RP5 durante más de 3000 ms (`suspectTimeout`). Es evidencia de *ausencia de comunicación*, compatible con: RP5 muerto, RP5 pausado (GC, VM freeze), partición de red, o pérdida de mensajes. RP2 puede afirmar `suspected`, nada más.

**2. ¿Por qué `suspected` no significa `dead`?**
En un sistema asíncrono es imposible distinguir un proceso lento de uno muerto (no hay cota superior de retardo). El detector es *no confiable por diseño*: acepta falsos positivos a cambio de progreso. Tratar `suspected` como `dead` habilita liberar locks ajenos, duplicar líderes y pisar estado de procesos vivos.

**3. ¿Qué riesgo introduce que RP5 esté pausado y luego despierte?**
RP5 no sabe que fue sospechado ni que hubo elección: despierta creyéndose líder legítimo. Si el sistema no valida epoch, hay **dos líderes activos** (split-brain) emitiendo comandos simultáneos: asignaciones contradictorias de drones, rutas duplicadas, estado corrupto.

**4. ¿Qué evidencia mínima debería registrarse para justificar la elección?**
Último heartbeat recibido de RP5 (timestamp + monotonic), duración del silencio vs `suspectTimeout`, nodo que declaró la sospecha, mensajes de elección enviados y respuestas (RP4 sí; RP3 y RP5 no dentro de `electionTimeout`), epoch anterior y nuevo, anuncio del nuevo líder y correlation id del proceso de elección completo.

### Elección tipo Bully

| Paso | Acción | Resultado esperado | Riesgo o límite |
|---:|---|---|---|
| 1 | RP2 detecta ausencia de heartbeat del líder RP5 | Tras 3000 ms sin heartbeats, RP2 marca a RP5 como `suspected` | Puede ser falso positivo (pausa o red); la sospecha es local a RP2, no consensuada |
| 2 | RP2 inicia elección | RP2 abre ronda de elección; registra evidencia y arranca `electionTimeout` de 5000 ms | Elecciones concurrentes si otros nodos sospechan a la vez; tormenta de mensajes |
| 3 | RP2 contacta nodos con id mayor | Envía `ELECTION` a RP3 (3), RP4 (4) y RP5 (5) | RP3 está caído y RP5 pausado: RP2 gastará el timeout esperándolos; el timeout debe estar bien calibrado |
| 4 | RP4 responde y RP3/RP5 no responden | RP4 contesta `OK` (RP2 queda fuera); RP4 continúa la elección hacia RP5 | "No responde" ≠ muerto: RP5 puede despertar a mitad de elección y reclamar su id mayor |
| 5 | RP4 asume liderazgo si no aparece un nodo mayor válido | RP5 no responde dentro del timeout → RP4 se autoproclama líder | RP4 es líder porque tiene el *id vivo más alto*, no el mejor estado; Bully no valida datos ni logs |
| 6 | RP4 anuncia nuevo líder/epoch | Broadcast `COORDINATOR` con epoch incrementado (6 → 7); los nodos actualizan su epoch vigente | Si el anuncio no llega a todos (partición), nodos desactualizados podrían seguir aceptando a RP5; el epoch debe validarse también en los recursos, no solo en los nodos |

### Líder viejo y split-brain

1. Sus comandos deben ser **rechazados por los recursos y servicios receptores**, porque llegan con epoch 6 cuando el vigente es 7. Además, al recibir el primer rechazo (o el anuncio de RP4), RP5 debe degradarse a seguidor. No basta esperar que RP5 "se dé cuenta": el rechazo debe ser mecánico.
2. **Epoch/term monotónico creciente** asignado en cada elección, la misma idea que el fencing token pero a nivel de liderazgo: los receptores solo aceptan comandos con epoch ≥ el mayor visto (y estrictamente el vigente para escrituras). Raft llama a esto *term*.
3. **En el recurso/servicio que recibe el comando** (gestor de flota, store de asignaciones), no solo en el líder ni en los nodos del clúster. Es el mismo principio de la Fase 3: el validador vive del lado de quien persiste, porque es el único punto que el proceso stale no puede eludir. Mi Fase 5 lo valida en `FleetManager.isLeaderStale`.
4. Split-brain operativo: RP4 y RP5 asignan drones y rutas de forma independiente y contradictoria: doble asignación a escala de flota, planes de vuelo en conflicto, telemetría interpretada bajo dos vistas divergentes y un estado final no reconciliable sin intervención manual.

## Fase 5 - Implementación acotada

**Archivo implementado:** `services/centro-logistica/src/pc3-coordination-lab.js`

**Comando de ejecución:**

```bash
node services/centro-logistica/src/pc3-coordination-lab.js
```

**Salida relevante (resumida; la salida completa incluye `checks`, `assignments`, `auditLog` y `limitations`):**

```json
{
  "lc2": {
    "decision": "accepted",
    "missionId": "M-2002",
    "fence": 22,
    "detail": "asignación persistida con fence 22 bajo epoch 7"
  },
  "lc1Old": {
    "decision": "rejected",
    "reason": "stale-owner-or-fence",
    "detail": "lease vencido: deadline=3000ms < now=7600ms"
  },
  "rp5OldLeader": {
    "decision": "rejected",
    "reason": "stale-leader",
    "detail": "epoch 6 < epoch vigente 7"
  },
  "assignments": [
    ["Drone-Alpha-1", { "missionId": "M-2002", "actor": "LC2", "fence": 22, "assignedAtMs": 4600 }]
  ]
}
```

**Interpretación técnica:**

- **LC2 aceptado**: lease vigente (deadline 4500+3000=7500 > now 4600), fence 22 mayor que cualquier fence previo, epoch 7 vigente, dron libre. Se persiste y `latestFenceByDrone` sube a 22.
- **LC1-old rechazado** (`stale-owner-or-fence`): su leaseDeadline es 0+3000=3000 ms y escribe en now=7600 ms. Cae en la primera validación (lease vencido); si hubiera pasado, el fence 21 ≤ 22 lo habría rechazado igual. Dos defensas independientes contra el mismo riesgo.
- **RP5-old-leader rechazado** (`stale-leader`): epoch 6 < 7. Se rechaza *antes* de evaluar lease o asignación: un líder viejo no debe ni llegar a tocar el estado.
- La doble asignación queda demostrada como prevenida: `assignments` contiene una sola entrada para `Drone-Alpha-1` (M-2002) y el `auditLog` explica cada decisión con su evidencia (`checks` incluye deadline vs now, fence vs último aceptado y epoch vs vigente).

**Limitaciones explícitas de la simulación:**

- Un solo proceso: no hay red, particiones, pérdida de mensajes ni relojes físicos reales.
- El epoch vigente y los fences viven en memoria local, no en un store consensuado ni durable: no sobreviven a un reinicio.
- `nowMs` es tiempo lógico inyectado, no un reloj monotónico real; no se simula skew.
- No hay elección de líder, renovación de leases ni heartbeats: solo la validación defensiva en el recurso protegido, que es el punto que la PC3 pide demostrar.
- La emisión monotónica de fences y epochs se asume correcta; en producción la debe garantizar el servicio de locks/elección.

## Fase 6 - Decisión arquitectónica

### Matriz de problemas

| Problema | Opción recomendada | Garantía buscada | Tradeoff/costo | ¿Se implementa en Fase 5? |
|---|---|---|---|---|
| Evitar doble asignación de drones | DB atómica (constraint único + compare-and-set) + fencing token + Idempotency-Key | Exclusión a nivel del dato: una sola fila de asignación por dron, escrituras stale rechazadas por token, reintentos absorbidos | La DB se vuelve punto de contención y de fallo; requiere esquema disciplinado y latencia extra por transacción | Sí, simulado: mapa de asignaciones + validación de fence en memoria |
| Elegir líder de planificador-rutas | etcd lease + campaña de elección (o ZooKeeper ephemeral sequential node) | A lo sumo un líder reconocido por el store consensuado; failover automático al expirar el lease del líder caído | Operar un clúster consensuado (3-5 nodos, quórum, upgrades); si etcd pierde quórum, no hay elección aunque los planificadores estén sanos | No: prohibido en Fase 5; solo se simula el *efecto* (epoch vigente) |
| Rechazar comandos de líderes viejos | Fencing token / epoch emitido por el servicio de elección y **validado en cada recurso receptor** | Escrituras de líderes con epoch menor rechazadas mecánicamente, aunque el líder viejo se crea legítimo | Todos los recursos deben persistir el mayor epoch visto y validar cada escritura; instrumentación en cada servicio | Sí, simulado: `isLeaderStale` compara epoch contra el vigente |
| Publicar configuración dinámica | etcd watch (alternativa: ZooKeeper watches) | Lectura consistente de la config y notificación push de cambios versionados a todos los nodos | Acoplamiento al clúster etcd; los watchers deben manejar reconexión y re-lectura; config cacheada puede quedar stale durante particiones | No: fuera del alcance del incidente simulado |
| Detectar instancias saludables | Consul health check (o heartbeats + suspectTimeout como en Fase 4) | Vista compartida de qué instancias responden, con estados graduales (passing/warning/critical), no binarios | Falsos positivos inevitables (pausas ≠ muerte); tuning de timeouts; el estado "healthy" siempre es una foto retrasada | No: la Fase 4 lo analiza conceptualmente; no se implementa |

### Justificación de las herramientas recomendadas

**etcd (lease + election) para liderazgo.** Garantía: linearizabilidad vía Raft: el store decide un único líder por generación y emite una *revision* monotónica usable como epoch/fencing. Problema concreto que resuelve: la elección casera tipo Bully de la Fase 4, que no tolera particiones ni valida estado. Costo: operar 3-5 nodos con quórum, monitoreo propio, y una nueva dependencia crítica: sin quórum de etcd no hay elección posible. Modo de falla restante: un líder con lease vigente puede quedar pausado igual que RP5: etcd garantiza *unicidad de lease*, no que el líder esté procesando. Por eso la validación de epoch **debe seguir existiendo en el recurso protegido**: etcd reduce la frecuencia del problema, el fencing en el recurso elimina su impacto.

**DB atómica + fencing + Idempotency-Key para asignaciones.** Garantía: la exclusión vive donde vive el dato: constraint único sobre `droneId` y compare-and-set sobre el fence. Problema: la doble asignación de `Drone-Alpha-1` no se previene con locks "de cortesía": se previene donde se persiste. Costo: latencia transaccional y contención en drones muy solicitados. Modo de falla restante: efectos laterales fuera de la transacción (notificaciones, reservas externas) requieren compensación idempotente.

**Distinción PC3 vs futuro:** la Fase 5 simula las *reglas de decisión* (lease vencido, fence stale, epoch viejo) en un proceso local. La arquitectura futura mueve la *emisión* de esas credenciales a sistemas consensuados (etcd/ZooKeeper), pero la *validación* permanece exactamente donde la puse en la Fase 5: en el recurso protegido.

## Cierre técnico

**Qué aceptaría:** la asignación de LC2 (`M-2002`, fence 22, epoch 7): lease vigente, fence mayor, líder vigente, dron libre. Es la única escritura con evidencia completa de ownership y liderazgo.

**Qué rechazaría:** la escritura de LC1 (lease vencido y fence 21 < 22: doble defensa) y cualquier comando de RP5 con epoch 6 (líder viejo). Ambos rechazos son mecánicos y auditables; no dependen de que el proceso stale coopere.

**Qué dejaría en revisión:** la misión `M-2001` (reintento de asignación limpia + compensación de efectos laterales si los hubo) y la decisión preliminar de Centro de Logística, tomada sin conocer `BatteryCritical` (c ∥ e): debe reconfirmarse contra el último estado causalmente conocido del dron antes de despachar.

**Límites honestos:** no puedo afirmar el orden físico real entre E1 y E2 (los intervalos de error se solapan); no puedo afirmar que RP5 estuviera muerto (solo sospechado); y mi simulación no prueba tolerancia a particiones ni durabilidad: prueba que las reglas de decisión correctas, aplicadas en el recurso protegido, evitan la doble asignación y el split-brain de este incidente. La evidencia disponible sostiene exactamente eso, y nada más.
