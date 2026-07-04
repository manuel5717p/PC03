# Laboratorio Sesión 24 - Vector clocks y causalidad

> Resultado esperado: el estudiante puede comparar dos vector clocks, justificar si la relación es `before`, `after`, `equal` o `concurrent`, y explicar por qué detectar concurrencia o conflicto no equivale a resolverlo automáticamente.

La Sesión 24 continúa la ruta de Unidad 3: tiempo físico, sincronización de relojes y Lamport clocks. El nuevo objetivo es más fino: detectar cuándo dos eventos tienen una relación causal y cuándo son concurrentes porque sus vectores son incomparables.

## Relación con la Sesión 23

Lamport clocks permiten afirmar una condición necesaria: si `A happened-before B`, entonces `L(A) < L(B)`. Pero un contador escalar no alcanza para detectar concurrencia con precisión. Vector clocks agregan un componente por nodo para registrar qué conocimiento causal vio cada proceso.

```text
Evento local/send: VC[nodo] = VC[nodo] + 1
Receive: VC = max(VC_local, VC_mensaje) componente a componente; luego VC[nodo]++
Comparación:
- before: todos los componentes <= y al menos uno <
- after: todos los componentes >= y al menos uno >
- equal: todos iguales
- concurrent: algunos componentes mayores y otros menores
```

## Preparación

Desde la raíz del proyecto:

```bash
cd services/monitor-telemetria
npm install
```

Validación rápida del laboratorio:

```bash
npm run lab:vector-clocks -- --causal-chain
```

Si se necesita revisar la estructura completa de la evidencia, ejecute un modo con `--json`:

```bash
npm run lab:vector-clocks -- --merge-and-conflict --json
```

No es necesario modificar código para esta sesión. La defensa debe apoyarse en la salida del laboratorio y en la comparación manual de vectores.

## Resultado esperado

Al finalizar, el estudiante debe poder:

- explicar qué representa cada componente del vector clock;
- aplicar la regla `max` componente a componente durante un receive;
- comparar dos vectores sin inventar un orden global;
- reconocer eventos concurrentes cuando los vectores son incomparables;
- interpretar un conflicto como evidencia de ramas concurrentes, no como una resolución automática;
- conectar esta sesión con la Sesión 25 sin confundir causalidad con exclusión mutua.

## Comandos

Desde `services/monitor-telemetria`:

```bash
npm run lab:vector-clocks -- --causal-chain
npm run lab:vector-clocks -- --concurrent-events
npm run lab:vector-clocks -- --merge-and-conflict
```

También puede inspeccionarse como JSON:

```bash
npm run lab:vector-clocks -- --merge-and-conflict --json
```

En la salida por defecto del modo `--merge-and-conflict`, revise la sección **Evidencia causal**: allí aparecen los vectores comparados, la relación concurrente del par, el motivo del conflicto y qué ramas quedan visibles después del merge.

## Escenarios y modos del laboratorio

| Modo | Comando | Qué demuestra |
|---|---|---|
| Cadena causal | `npm run lab:vector-clocks -- --causal-chain` | Los vectores crecen y se dominan cuando existe `happened-before`. |
| Eventos concurrentes | `npm run lab:vector-clocks -- --concurrent-events` | Eventos locales independientes quedan como vectores incomparables. |
| Merge y conflicto | `npm run lab:vector-clocks -- --merge-and-conflict` | El merge muestra visibilidad causal, pero no resuelve automáticamente conflictos de negocio. |

### Escenario 1 - Cadena causal

Ejecute:

```bash
npm run lab:vector-clocks -- --causal-chain
```

Resultado esperado: los eventos posteriores dominan a los anteriores porque todos sus componentes son mayores o iguales y al menos uno crece. Esa dominancia permite defender `A happened-before B` dentro de la cadena observada.

Interpretación: si `VC(A) <= VC(B)` componente a componente y existe al menos una diferencia estricta, entonces A está antes que B en la evidencia causal. La comparación no depende de la hora física.

### Escenario 2 - Eventos concurrentes

Ejecute:

```bash
npm run lab:vector-clocks -- --concurrent-events
```

Resultado esperado: dos nodos producen eventos independientes. Un vector tendrá algún componente mayor y otro componente menor respecto del segundo vector.

Interpretación: cuando ningún vector domina al otro, los eventos son `concurrent`. Eso no significa que ocurrieron “exactamente al mismo tiempo”; significa que la evidencia disponible no muestra relación causal entre ellos.

### Escenario 3 - Merge y conflicto

Ejecute:

```bash
npm run lab:vector-clocks -- --merge-and-conflict
```

Resultado esperado: el monitor combina conocimiento causal con `max` componente a componente. Si llegan ramas concurrentes sobre una misma decisión de negocio, el laboratorio debe exponer el conflicto y conservar evidencia de las ramas visibles.

Interpretación: el merge de vector clocks mejora la visibilidad causal, pero no decide por sí solo qué valor de negocio gana. Esa decisión requiere una política posterior: revisión humana, regla de prioridad, CRDT, compensación o rechazo explícito.

## Cómo interpretar la evidencia

Use esta lectura mínima para defender la salida:

| Evidencia | Cómo leerla | Defensa esperada |
|---|---|---|
| `vector comparison` | Compare todos los componentes, no solo el contador local. | `before`/`after` requieren dominancia componente a componente; `equal` requiere igualdad total; `concurrent` aparece cuando hay componentes cruzados. |
| `concurrent` | Ningún vector domina al otro. | No prueba simultaneidad física; prueba ausencia de relación causal observada. |
| `conflict` | Dos ramas concurrentes afectan una decisión compatible con conflicto de negocio. | El sistema detecta que no debe inventar una única verdad sin política de resolución. |
| `merge` | El receptor toma `max(local, incoming)` por componente y luego registra su evento. | El merge conserva conocimiento causal acumulado, pero no elimina automáticamente las ramas conflictivas. |

Regla práctica:

```text
A before B     => todos A[i] <= B[i] y algún A[i] < B[i]
A after B      => todos A[i] >= B[i] y algún A[i] > B[i]
A equal B      => todos A[i] == B[i]
A concurrent B => hay al menos un componente mayor y otro menor entre A y B
```

## Preguntas de defensa

1. ¿Qué componentes cambian cuando ocurre un evento local?
2. ¿Por qué el receive debe hacer `max` componente a componente antes de incrementar?
3. ¿Qué evidencia muestra que dos eventos son concurrentes?
4. En el modo de conflicto, ¿qué sabe el monitor después de mergear ambas ramas?
5. ¿Por qué detectar un conflicto no equivale a resolverlo?
6. ¿Por qué un vector clock puede detectar concurrencia mejor que un Lamport clock escalar?
7. ¿Qué error conceptual aparece si se ordenan eventos concurrentes solo para que el log “se vea lineal”?
8. ¿Qué política adicional haría falta para resolver un conflicto de negocio?

## Advertencias conceptuales

- Vector clocks no son timestamps físicos. No responden “qué hora era”, sino “qué conocimiento causal estaba incorporado”.
- Un orden visual en una tabla no debe venderse como causalidad si los vectores son concurrentes.
- `concurrent` no significa necesariamente simultáneo; significa no comparable causalmente con la evidencia disponible.
- Detectar conflicto no es resolver conflicto. El laboratorio muestra el problema para que la política de resolución sea explícita.
- Vector clocks no implementan exclusión mutua, locks, leases, elección de líder ni consenso. Preparan el razonamiento causal que luego ayuda a explicar esos temas.
- Aumentar el número de nodos aumenta el tamaño del vector; esa sobrecarga es parte del costo pedagógico que debe reconocerse.

## Observabilidad

La plataforma educativa expone el laboratorio `vector-clocks` como Sesión 24:

```bash
cd services/observability-platform
npm start
```

Luego abre `http://localhost:8010` y ejecuta los modos disponibles. La interfaz muestra resumen, observaciones, métricas, línea de tiempo, contrato de aprendizaje y JSON crudo.

## Cierre conceptual

Vector clocks no son una solución de exclusión mutua ni un mecanismo de lock. Sirven para razonar causalidad: qué evento vio a cuál, qué eventos son concurrentes y cuándo una decisión debe reconocer un conflicto.

El cierre de la defensa debe dejar clara esta frase: **un vector clock permite detectar relaciones causales y concurrencia; la política de coordinación o resolución viene después**. La Sesión 25 toma esa base para estudiar, mediante un modelo educativo determinístico, cómo arbitrar requests hacia una sección crítica compartida.
