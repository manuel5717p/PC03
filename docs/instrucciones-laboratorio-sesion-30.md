# Práctica Calificada 3 — AURA Coordinación bajo Falla

Esta práctica calificada evalúa si puedes razonar como responsable técnico de AURA cuando el sistema está parcialmente degradado: relojes físicos imperfectos, causalidad incompleta, locks vencidos, líderes sospechados y decisiones operativas con riesgo real.

| Campo | Detalle |
|---|---|
| Unidad | Unidad 3: Tiempo, sincronización, causalidad y coordinación |
| Duración | 120 minutos |
| Modalidad | Individual, aplicada y con evidencia verificable |
| Componentes | Análisis técnico 60%, Implementación acotada 25%, Decisión arquitectónica 15% |

## Puente con la Sesión 29

La Sesión 29 fue entrenamiento: te mostró cómo integrar evidencia de tiempo físico, causalidad, locks, leases, fencing, detectores de fallas y liderazgo. Esta PC3 usa el mismo tipo de defensa, pero cambia el incidente y elimina el acompañamiento paso a paso.

No busco una respuesta larga. Busco una respuesta defendible: qué sabes, qué no puedes afirmar, qué evidencia usas y qué decisión reduce riesgo operacional.

## Caso base

AURA opera una flota de drones de entrega urbana. Durante una ventana crítica, varios servicios intentan coordinar asignación de drones, telemetría de batería, locks de recursos y liderazgo del planificador de rutas.

El incidente reporta estos síntomas:

1. Los timestamps físicos de distintos servicios no coinciden.
2. Algunos eventos parecen ocurrir antes que otros, pero no hay certeza causal.
3. El monitor de telemetría reporta batería crítica.
4. Centro de Logística toma una decisión preliminar sin conocer todos los eventos.
5. Dos instancias intentan asignar el mismo dron.
6. Un lease de lock expira durante una operación lenta.
7. Un proceso viejo intenta escribir después de perder el lock.
8. El líder de planificador-rutas deja de enviar heartbeats.
9. Se dispara una elección de líder.
10. Un líder viejo despierta e intenta seguir coordinando.

Tu tarea es reconstruir la evidencia, separar orden físico de orden causal, decidir qué operaciones se aceptan o rechazan, y proponer una arquitectura futura con garantías explícitas.

## Entregables obligatorios

| Entregable | Requisito |
|---|---|
| `docs/pc3-respuestas.md` | Documento principal de respuestas con la estructura obligatoria indicada abajo. |
| Implementación acotada | Archivo recomendado: `services/centro-logistica/src/pc3-coordination-lab.js`. Si trabajas fuera del repo, usa `pc3-coordination-lab.js`. |
| Evidencia de ejecución | Comando usado, salida relevante e interpretación breve. |
| Matriz de decisión arquitectónica | Comparación de mecanismos, garantías, riesgos y tradeoffs para AURA. |

## Estructura obligatoria de `docs/pc3-respuestas.md`

Usa estos encabezados exactamente, en este orden:

```markdown
# PC3 - AURA Coordinación bajo Falla

## Datos del estudiante

## Fase 1 - Tiempo físico y sincronización

## Fase 2 - Vector clocks y causalidad

## Fase 3 - Locks, leases y fencing

## Fase 4 - Failure detector y elección de líder

## Fase 5 - Implementación acotada

## Fase 6 - Decisión arquitectónica

## Cierre técnico
```

## Reglas de trabajo

- Puedes consultar tus guías de las Sesiones 21-29, pero la respuesta debe aplicarse al incidente de esta PC3.
- No implementes ZooKeeper, etcd, Raft, Paxos, consenso real, quórums productivos, membresía productiva, transacciones distribuidas ni failover real en la Fase 5.
- En la Fase 6 sí puedes recomendar herramientas como etcd, ZooKeeper o un protocolo basado en Raft si justificas qué garantía aportan, qué costo introducen y qué problema concreto resuelven.
- No uses timestamps físicos como prueba única de causalidad.
- No trates `suspected` como equivalente a `dead`.
- No liberes un lock si no puedes demostrar ownership.
- No aceptes escrituras de un líder antiguo sin un mecanismo que las rechace.
- Prioriza claridad técnica, evidencia y límites honestos sobre cantidad de texto.

## Fase 1 - Tiempo físico y sincronización

### Datos del incidente

Analiza estos eventos:

| Evento | Servicio | Timestamp físico reportado | Evento | Dato |
|---|---|---:|---|---|
| E1 | `monitor-telemetria` | 10:15:00.300 | `BatteryLow` | 18% |
| E2 | `centro-logistica` | 10:15:00.100 | `MissionAssigned` | - |
| E3 | `gestor-flota` | 10:15:00.250 | `DroneAvailable` | - |
| E4 | `monitor-telemetria` | 10:15:00.500 | `BatteryCritical` | 12% |

Condiciones conocidas:

- `monitor-telemetria` skew +400 ms
- `centro-logistica` skew -200 ms
- `gestor-flota` skew +100 ms
- error estimado de sincronización ±300 ms

### Tareas

Responde estas preguntas:

1. ¿Se puede afirmar que `MissionAssigned` ocurrió antes que `BatteryLow` solo por timestamp físico?
2. ¿Qué riesgo operativo aparece si AURA ordena estos eventos solo por timestamp?
3. ¿Qué campos temporales deberían registrarse como mínimo?
4. ¿Qué decisión de negocio no debería depender solo del reloj físico?

### Guía docente

Tu respuesta debe mostrar incertidumbre temporal. No alcanza decir “E2 tiene una hora menor”. Debes explicar cómo el skew y el margen ±300 ms afectan la confianza del orden. Si corriges conceptualmente los timestamps, muestra el razonamiento, pero no conviertas esa corrección en prueba causal absoluta.

Como mínimo, separa:

- wall-clock reportado;
- servicio que lo emitió;
- skew conocido o estimado;
- margen de error;
- monotonic time o duración local cuando corresponda;
- correlation/trace id;
- id de evento y productor;
- metadata causal si existe.

## Fase 2 - Vector clocks y causalidad

### Procesos y reglas

Procesos:

- P1 = `monitor-telemetria`
- P2 = `centro-logistica`
- P3 = `gestor-flota`

Cada vector usa el orden `[P1, P2, P3]` e inicia en `[0, 0, 0]`.

Reglas:

- Evento local: incrementa el componente del proceso local.
- Envío de mensaje: incrementa el componente del proceso local y adjunta el vector al mensaje.
- Recepción de mensaje: aplica máximo componente a componente entre el vector local y el vector recibido; luego incrementa el componente del proceso receptor.
- Comparación: `X happened-before Y` si todos los componentes de X son menores o iguales que los de Y y al menos uno es menor. Si no se cumple en ninguna dirección, los eventos son concurrentes.

### Eventos a completar

Completa la tabla. No incluyas una tabla final copiada de otra fuente: calcula los vectores y muestra tu procedimiento.

| # | Etiqueta | Proceso | Acción | Mensaje recibido | Vector resultante |
|---:|---|---|---|---|---|
| 1 | a | P1 | recibe telemetría batería 18% | - | TODO |
| 2 | m1 | P1 → P2 | envía `BatteryLowAlert` | - | TODO |
| 3 | d | P2 | recibe `BatteryLowAlert` | m1 | TODO |
| 4 | b | P1 | recibe telemetría GPS | - | TODO |
| 5 | m3 | P2 → P3 | solicita estado del dron | - | TODO |
| 6 | e | P2 | registra decisión preliminar de misión | - | TODO |
| 7 | f | P3 | recibe solicitud de estado | m3 | TODO |
| 8 | c | P1 | recibe telemetría batería 12% | - | TODO |
| 9 | m2 | P3 → P1 | envía estado actualizado | - | TODO |
| 10 | g | P1 | recibe estado actualizado | m2 | TODO |

### Comparaciones requeridas

Completa esta tabla e interpreta el resultado en términos de riesgo para AURA:

| Comparación | Relación (`before`, `after`, `equal`, `concurrent`) | Evidencia vectorial | Implicación para AURA |
|---|---|---|---|
| a vs d | TODO | TODO | TODO |
| d vs e | TODO | TODO | TODO |
| b vs d | TODO | TODO | TODO |
| c vs e | TODO | TODO | TODO |
| f vs g | TODO | TODO | TODO |
| e vs g | TODO | TODO | TODO |

### Guía docente

La parte importante no es llenar números por llenar. La parte importante es defender qué eventos están causalmente relacionados y cuáles deben tratarse como concurrentes o incompletos. Si una decisión preliminar se tomó sin conocer batería crítica o estado actualizado, dilo con precisión y explica el riesgo.

## Fase 3 - Locks, leases y fencing

### Escenario

| Campo | Valor |
|---|---|
| Recurso | `Drone-Alpha-1` |
| Operación crítica | `assignDroneIfAvailable(droneId, missionId)` |

Timeline:

| Tiempo | Evento |
|---|---|
| T0 | LC1 adquiere lock `lock:drone:Alpha` TTL=3000ms fence=21 |
| T1 | LC1 inicia planificación |
| T2 | LC1 se bloquea 4500ms esperando `planificador-rutas` |
| T3 | expira lease de LC1 |
| T4 | LC2 adquiere lock `lock:drone:Alpha` TTL=3000ms fence=22 |
| T5 | LC2 asigna `Drone-Alpha-1` a `M-2002` |
| T6 | LC1 despierta |
| T7 | LC1 intenta asignar `Drone-Alpha-1` a `M-2001` con fence=21 |

### Diagnóstico requerido

Completa estos campos:

| Campo | Respuesta |
|---|---|
| `leaseDeadline` de LC1 | TODO |
| Estado de LC1 en T7 | TODO |
| Riesgo si se acepta la escritura de LC1 | TODO |
| Comparación de fencing requerida | TODO |
| Decisión segura sobre `M-2001` | TODO |
| Compensación o revisión necesaria | TODO |

### Conceptos obligatorios

| Concepto | Qué garantiza | Qué no garantiza | Riesgo si se omite |
|---|---|---|---|
| Lock | TODO | TODO | TODO |
| Lease con TTL | TODO | TODO | TODO |
| Renovación | TODO | TODO | TODO |
| Fencing token | TODO | TODO | TODO |
| Operación idempotente | TODO | TODO | TODO |

### Decisión de flota

Responde:

1. ¿Debe AURA aceptar la asignación de LC1 a `M-2001`?
2. ¿Qué debe validar el recurso protegido antes de persistir la asignación?
3. ¿Qué debería quedar registrado en auditoría?
4. ¿Qué harías con la misión `M-2001`: rechazar, reintentar, compensar o dejar en revisión?

### Métricas mínimas

Propón métricas para observar este riesgo en producción:

- intentos de adquisición de lock;
- expiraciones de lease;
- operaciones rechazadas por fencing;
- duración de operación crítica vs TTL;
- renovaciones tardías o fallidas;
- escrituras de owners stale;
- compensaciones por doble asignación evitada.

## Fase 4 - Failure detector y elección de líder

### Escenario

Nodos:

| Nodo | id | Estado observado |
|---|---:|---|
| RP1 | 1 | vivo |
| RP2 | 2 | vivo |
| RP3 | 3 | caído |
| RP4 | 4 | vivo |
| RP5 | 5 | pausado/no responde |

Líder actual: RP5

Parámetros:

| Parámetro | Valor |
|---|---:|
| `heartbeatInterval` | 1000ms |
| `suspectTimeout` | 3000ms |
| `electionTimeout` | 5000ms |

Timeline:

| Tiempo | Evento |
|---|---|
| T0 | RP5 coordina como líder actual |
| T1 | RP5 envía heartbeat a RP1, RP2 y RP4 |
| T2 | RP3 cae y deja de responder |
| T3 | RP5 queda pausado/no responde |
| T4 | RP2 deja de recibir heartbeats de RP5 por más de `suspectTimeout` |
| T5 | RP2 marca a RP5 como sospechado, no como muerto confirmado |
| T6 | RP2 dispara elección de líder |
| T7 | RP2 envía mensajes de elección a RP3, RP4 y RP5 |
| T8 | RP4 responde; RP3 no responde; RP5 no responde antes de `electionTimeout` |
| T9 | RP4 se anuncia como nuevo líder; luego RP5 despierta e intenta seguir coordinando |

### Preguntas sobre failure detector

Responde:

1. ¿Qué puede afirmar RP2 sobre RP5 en T5?
2. ¿Por qué `suspected` no significa `dead`?
3. ¿Qué riesgo introduce que RP5 esté pausado y luego despierte?
4. ¿Qué evidencia mínima debería registrarse para justificar la elección?

### Elección tipo Bully

Completa los seis pasos:

| Paso | Acción | Resultado esperado | Riesgo o límite |
|---:|---|---|---|
| 1 | RP2 detecta ausencia de heartbeat del líder RP5 | TODO | TODO |
| 2 | RP2 inicia elección | TODO | TODO |
| 3 | RP2 contacta nodos con id mayor | TODO | TODO |
| 4 | RP4 responde y RP3/RP5 no responden | TODO | TODO |
| 5 | RP4 asume liderazgo si no aparece un nodo mayor válido | TODO | TODO |
| 6 | RP4 anuncia nuevo líder/epoch | TODO | TODO |

### Líder viejo y split-brain

Responde:

1. ¿Qué debe pasar si RP5 despierta después de T9 e intenta emitir comandos?
2. ¿Qué mecanismo permite rechazar comandos de líderes viejos: epoch, term, fencing token u otro?
3. ¿Dónde debe validarse ese mecanismo?
4. ¿Qué pasaría si AURA acepta comandos de RP4 y RP5 al mismo tiempo?

## Fase 5 - Implementación acotada

La implementación debe ser pequeña, ejecutable y enfocada en decisiones. No construyas infraestructura distribuida real. Debes simular lo suficiente para demostrar vencimiento de lease, rechazo por fencing y rechazo de comandos de líderes viejos.

Archivo recomendado:

```text
services/centro-logistica/src/pc3-coordination-lab.js
```

Si trabajas fuera del repositorio, usa:

```text
pc3-coordination-lab.js
```

### Código inicial

Puedes partir de este esqueleto:

```js
class FleetManager {
  constructor() {
    this.assignments = new Map();
    this.latestFenceByDrone = new Map();
    this.currentLeaderEpoch = 7;
  }

  assignDroneIfAvailable({ droneId, missionId, actor, nowMs, lease, fence, leader }) {
    // TODO: reject stale leaders before checking assignment.
    // TODO: calculate whether the lease expired before nowMs.
    // TODO: reject writes whose fence is lower than the latest accepted fence.
    // TODO: reject double assignment when the drone is already assigned.
    // TODO: persist only safe assignments and return a structured decision.
  }

  isLeaseExpired(lease, nowMs) {
    // TODO: return true when nowMs is greater than acquiredAtMs + ttlMs.
  }

  isFenceStale(droneId, fence) {
    // TODO: compare fence with latest accepted fence for the drone.
  }

  isLeaderStale(leader) {
    // TODO: compare leader.epoch with currentLeaderEpoch.
  }
}

function runScenario() {
  const fleetManager = new FleetManager();

  const lc2 = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2002',
    actor: 'LC2',
    nowMs: 4600,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'LC2',
      acquiredAtMs: 4500,
      ttlMs: 3000,
    },
    fence: 22,
    leader: { id: 'RP4', epoch: 7 },
  });

  const lc1Old = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2001',
    actor: 'LC1-old',
    nowMs: 7600,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'LC1',
      acquiredAtMs: 0,
      ttlMs: 3000,
    },
    fence: 21,
    leader: { id: 'RP4', epoch: 7 },
  });

  const rp5OldLeader = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2003',
    actor: 'RP5-old-leader',
    nowMs: 8000,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'RP5',
      acquiredAtMs: 0,
      ttlMs: 3000,
    },
    fence: 20,
    leader: { id: 'RP5', epoch: 6 },
  });

  return {
    lc2,
    lc1Old,
    rp5OldLeader,
    assignments: Array.from(fleetManager.assignments.entries()),
  };
}

console.log(JSON.stringify(runScenario(), null, 2));
```

### Requisitos mínimos

Tu implementación debe demostrar:

- cálculo de `leaseDeadline`;
- detección de escritura posterior al vencimiento del lease;
- rechazo cuando el `fence` es menor que el último fence aceptado para el dron;
- rechazo de comando emitido por líder viejo;
- prevención de doble asignación de `Drone-Alpha-1`;
- salida estructurada que permita explicar cada decisión;
- limitaciones explícitas de la simulación.

### Salida conceptual esperada

La salida no debe ser idéntica byte a byte. Sí debe probar ideas equivalentes:

```json
{
  "lc2": {
    "decision": "accepted",
    "missionId": "M-2002",
    "fence": 22
  },
  "lc1Old": {
    "decision": "rejected",
    "reason": "stale-owner-or-fence"
  },
  "rp5OldLeader": {
    "decision": "rejected",
    "reason": "stale-leader"
  }
}
```

### Campos de respuesta

En `docs/pc3-respuestas.md`, incluye:

- archivo implementado;
- comando de ejecución;
- salida relevante;
- interpretación técnica;
- limitaciones explícitas de la simulación.

## Fase 6 - Decisión arquitectónica

Ahora deja de pensar como programador de un script y piensa como arquitecto responsable de AURA. La pregunta es: ¿qué mecanismo recomendarías para reducir este tipo de incidente en una versión posterior?

### Matriz de problemas

Completa la matriz usando estos problemas como fuente de verdad:

1. Evitar doble asignación de drones.
2. Elegir líder de planificador-rutas.
3. Rechazar comandos de líderes viejos.
4. Publicar configuración dinámica.
5. Detectar instancias saludables.

Opciones disponibles:

- DB atómica
- Redis lock
- etcd lease
- ZooKeeper ephemeral sequential node
- Consul health check
- fencing token
- Idempotency-Key

| Problema | Opción recomendada | Garantía buscada | Tradeoff/costo | ¿Se implementa en Fase 5? |
|---|---|---|---|---|
| Evitar doble asignación de drones | TODO | TODO | TODO | TODO |
| Elegir líder de planificador-rutas | TODO | TODO | TODO | TODO |
| Rechazar comandos de líderes viejos | TODO | TODO | TODO | TODO |
| Publicar configuración dinámica | TODO | TODO | TODO | TODO |
| Detectar instancias saludables | TODO | TODO | TODO | TODO |

### Aclaración obligatoria

No implementes etcd, ZooKeeper ni Raft en la Fase 5. En la Fase 5 solo simulas reglas locales y decisiones acotadas. En la Fase 6 sí puedes recomendar etcd, ZooKeeper, Raft o servicios relacionados si explicas:

- qué garantía aportan;
- qué problema concreto resuelven;
- qué costo operativo o complejidad introducen;
- qué modo de falla todavía queda;
- qué validación debe existir en el recurso protegido.

Recomendar una herramienta sin garantía y tradeoff es una respuesta incompleta.

## Rúbrica de evaluación (100 puntos)

| Componente | Puntaje | Criterios |
|---|---:|---|
| Análisis técnico | 60 | Fase 1: tiempo físico e incertidumbre (10). Fase 2: vector clocks, causalidad y concurrencia (18). Fase 3: locks, leases y fencing (14). Fase 4: failure detector, elección y líder viejo (18). |
| Implementación acotada | 25 | Código pequeño y ejecutable (4), cálculo de lease/deadline (4), rechazo por fencing/stale owner (5), rechazo de líder viejo (4), prevención de doble asignación (4), salida estructurada con evidencia y limitaciones (4). |
| Decisión arquitectónica | 15 | Matriz clara de problemas y mecanismos (4), garantías explícitas (4), tradeoffs/costos (3), distinción entre implementación PC3 y recomendación futura (2), cierre técnico defendible (2). |

## Errores graves que bajan fuertemente la nota

- Usar timestamp físico como prueba definitiva de causalidad.
- Tratar `suspected` como `dead`.
- Diseñar un lock sin TTL.
- Omitir fencing cuando hay riesgo de dueño obsoleto.
- Liberar un lock sin demostrar ownership.
- Aceptar escrituras de un líder antiguo sin epoch, term o fencing.
- Recomendar etcd, ZooKeeper, Raft o consenso sin explicar garantía, costo y tradeoff.
- Implementar consenso real en la Fase 5 en lugar de una simulación acotada.
- Presentar una salida bonita pero sin evidencia de decisión.
- Resolver la matriz de arquitectura con nombres de herramientas sin conectarlas con el problema de AURA.

## Checklist final antes de entregar

- [ ] `docs/pc3-respuestas.md` usa exactamente la estructura obligatoria.
- [ ] La Fase 1 separa wall-clock, skew, error e incertidumbre.
- [ ] La Fase 2 contiene tus tablas de vector clocks y comparaciones, sin copiar una solución final externa.
- [ ] La Fase 3 calcula lease deadline y explica fencing.
- [ ] La Fase 4 diferencia sospecha de muerte confirmada y maneja líder viejo.
- [ ] La Fase 5 incluye archivo, comando, salida e interpretación.
- [ ] La Fase 6 distingue qué se simula ahora y qué se recomienda para arquitectura futura.
- [ ] El cierre técnico dice qué aceptarías, qué rechazarías y qué dejarías en revisión.
- [ ] No afirmas garantías que tu evidencia no prueba.

## Cierre

La PC3 no busca que memorices nombres de herramientas. Busca que puedas defender una decisión distribuida cuando el sistema está parcialmente roto. Si tu evidencia es honesta, tus límites son claros y tus decisiones reducen riesgo operacional, estás razonando como arquitecto de sistemas distribuidos.
