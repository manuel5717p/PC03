# Sesión 26 — Locks distribuidos, leases y riesgos operativos

## Objetivo

Estudiar cómo un lock distribuido protege ownership temporal mediante un lease con TTL, y por qué la expiración, la renovación tardía y los dueños stale son riesgos operativos reales.

El laboratorio usa una simulación determinística sobre `aura-dispatch-window`:

```text
ownership = owner + acquiredAt + leaseDeadline
leaseDeadline = acquiredAt + ttlMs
riesgo = renovar cerca del deadline o actuar después de expiredAt
fencingToken = evidencia para advertir/rechazar una acción stale
```

## Alcance

Esta sesión cubre locks, leases, TTL, expiración, reacquisición, renovación con jitter y riesgo de stale owner. El `fencingToken` aparece como evidencia operativa para explicar por qué una acción stale debe advertirse o rechazarse.

Quedan explícitamente fuera de alcance:

- elección de líder;
- sistemas de quórum;
- infraestructura completa de fencing;
- rediseño de plataforma o coordinación global.

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:distributed-locks -- --lock-acquire-and-hold
npm run lab:distributed-locks -- --lease-expiry-and-reacquire
npm run lab:distributed-locks -- --renewal-jitter-and-risk
npm run lab:distributed-locks -- --stale-owner-and-fencing-warning
```

Salida JSON para inspección o automatización:

```bash
npm run lab:distributed-locks -- --stale-owner-and-fencing-warning --json
```

Línea de tiempo:

```bash
npm run lab:distributed-locks -- --renewal-jitter-and-risk --timeline
```

## Modos

| Modo | Qué demuestra | Pregunta de defensa |
|---|---|---|
| `lock-acquire-and-hold` | Un owner adquiere y actúa dentro del TTL. | ¿Qué evidencia muestra que la acción ocurre antes de `leaseDeadline`? |
| `lease-expiry-and-reacquire` | El lease vence y otro nodo reacquiere con token mayor. | ¿Cuándo deja de ser válido el owner original? |
| `renewal-jitter-and-risk` | Renovar cerca del deadline deja poco margen ante jitter. | ¿Por qué una renovación “aceptada” puede seguir siendo riesgosa? |
| `stale-owner-and-fencing-warning` | Un owner stale intenta actuar y se rechaza por token anterior. | ¿Qué prueba que la acción pertenece a una generación vieja? |

## Cómo leer la evidencia

Revise estos campos en la salida estructurada:

- `evidence.owner`: dueño original del lease.
- `evidence.candidate`: nodo que puede reacquirir.
- `evidence.acquiredAt`: instante simulado de adquisición.
- `evidence.leaseDeadline`: vencimiento del lease.
- `evidence.renewAt`: instante programado de renovación cuando aplica.
- `evidence.expiredAt`: instante de expiración cuando aplica.
- `evidence.fencingToken`: token de la generación original.
- `evidence.currentFencingToken`: token vigente después de reacquisición.
- `evidence.staleOwnerAction`: acción rechazada del dueño stale cuando aplica.
- `metrics.renewalSlackMs`: margen restante al observar una renovación.
- `metrics.staleOwnerRejected`: debe ser `true` en el modo de stale owner.
- `timeline`: muestra adquisición, deadline, expiración, reacquisición, renovación o rechazo.

## Relación con sesiones anteriores

- La Sesión 21 mostró que el tiempo físico tiene skew, drift e incertidumbre.
- La Sesión 22 explicó que sincronizar relojes ayuda, pero no elimina el error.
- La Sesión 23 introdujo orden lógico con Lamport.
- La Sesión 24 distinguió causalidad y concurrencia con vector clocks.
- La Sesión 25 protegió una sección crítica sin modelar expiración.
- La Sesión 26 agrega ownership temporal: el lock vence y puede quedar un dueño stale.

## Checklist de aprendizaje

- [ ] Identificar `owner`, `candidate`, `acquiredAt` y `leaseDeadline`.
- [ ] Calcular si una acción ocurre dentro o fuera del TTL.
- [ ] Explicar qué cambia cuando el lease expira y otro nodo reacquiere.
- [ ] Evaluar si `renewAt` deja margen suficiente ante jitter.
- [ ] Explicar por qué un owner stale no debe actuar después de perder el lease.
- [ ] Usar `fencingToken` como evidencia de riesgo, sin venderlo como infraestructura completa.
- [ ] Defender por qué elección de líder y quórum pertenecen a sesiones posteriores.

## Conclusión

Un lock distribuido responsable no es una llave eterna. Es ownership temporal con vencimiento explícito. Si el sistema no razona sobre TTL, renovación, expiración y dueños stale, puede aceptar acciones de una generación vieja aunque otro nodo ya haya reacquirido el recurso.
