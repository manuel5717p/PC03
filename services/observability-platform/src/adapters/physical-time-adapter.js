const { runPhysicalTimeLab } = require("../../../monitor-telemetria/src/physical-time-lab");

const PHYSICAL_TIME_MODES = [
  {
    id: "normal",
    title: "Relojes físicos base",
    description: "Compara timestamps de wall-clock, duración monotónica y offsets pequeños tolerados."
  },
  {
    id: "skew",
    title: "Skew de reloj y ordenamiento",
    description: "Muestra cómo los timestamps reportados por clientes pueden invertir el orden real observado por el servidor."
  },
  {
    id: "drift",
    title: "Crecimiento de drift",
    description: "Muestra cómo crece el error del reloj entre puntos de sincronización cuando un nodo deriva."
  },
  {
    id: "tolerance",
    title: "Ventana de tolerancia de timestamps",
    description: "Valida timestamps de clientes solo dentro de un presupuesto explícito de tolerancia de skew."
  }
];

function listPhysicalTimeModes() {
  return PHYSICAL_TIME_MODES;
}

function keyMetric(label, value, unit, meaning) {
  return { label, value, unit, meaning };
}

function presentMetrics(metrics) {
  return metrics.filter((metric) => metric.value !== undefined && metric.value !== null);
}

function createTimeline(raw) {
  if (raw.mode === "drift") {
    return raw.timeline.map((entry) => ({
      id: `tick-${entry.tick}`,
      label: `Tick ${entry.tick}`,
      time: entry.clientReportedAt,
      decision: `skew=${entry.clockSkewMs}ms`
    }));
  }

  if (Array.isArray(raw.events)) {
    return raw.events.map((event) => ({
      id: event.eventId,
      label: event.nodeId,
      time: event.clientReportedAt,
      decision: event.acceptedWithinTolerance ? "aceptado" : "rechazado"
    }));
  }

  return [];
}

function createMetrics(raw) {
  if (raw.mode === "normal") {
    return {
      wallClockDurationMs: raw.wallClock.wallClockDurationMs,
      monotonicDurationMs: raw.wallClock.monotonicDurationMs,
      acceptedEvents: raw.tolerance.accepted,
      rejectedEvents: raw.tolerance.rejected
    };
  }

  if (raw.mode === "skew") {
    return {
      clientOrderInvertsActualOrder: raw.clientOrderInvertsActualOrder,
      eventCount: raw.events.length
    };
  }

  if (raw.mode === "drift") {
    return {
      startOffsetMs: raw.startOffsetMs,
      driftPerTickMs: raw.driftPerTickMs,
      finalClockSkewMs: raw.finalClockSkewMs,
      totalErrorGrowthMs: raw.totalErrorGrowthMs
    };
  }

  return {
    thresholdMs: raw.thresholdMs,
    acceptedEvents: raw.accepted,
    rejectedEvents: raw.rejected
  };
}

function createObservations(raw) {
  if (raw.mode === "normal") {
    return [
      "Los timestamps de wall-clock son metadatos útiles de eventos, pero monotonic time es más seguro para medir duración transcurrida.",
      "Incluso los relojes físicos saludables necesitan metadatos de skew y ventanas de tolerancia explícitas."
    ];
  }

  if (raw.mode === "skew") {
    return [
      `El orden reportado por el cliente ${raw.clientOrderInvertsActualOrder ? "invierte" : "coincide con"} el orden real observado por el servidor.`,
      "Los timestamps físicos por sí solos no prueban un orden global de eventos."
    ];
  }

  if (raw.mode === "drift") {
    return [
      `El skew de reloj crece de ${raw.startOffsetMs}ms a ${raw.finalClockSkewMs}ms en ${raw.ticks} ticks.`,
      "La sincronización tiene vida útil limitada; el drift debe presupuestarse entre puntos de sincronización."
    ];
  }

  return [
    `${raw.accepted} eventos están dentro de la ventana de tolerancia de ±${raw.thresholdMs}ms y ${raw.rejected} son rechazados.`,
    "Los timestamps de cliente deben validarse del lado del servidor antes de impulsar decisiones operacionales."
  ];
}

function createDecisions(raw) {
  if (raw.mode === "normal") {
    return [
      {
        id: "monotonic-duration",
        title: "Medición de duración",
        decision: "usar-tiempo-monotonico",
        recommendation: "Mida duraciones con reloj monotónico; use wall-clock solo como metadatos de evento."
      },
      {
        id: "tolerance-validation",
        title: "Validación de timestamps",
        decision: "rechazar-fuera-de-tolerancia",
        recommendation: "Rechace o aísle eventos cuyo skew supere la ventana de tolerancia explícita."
      }
    ];
  }

  if (raw.mode === "drift") {
    return [
      {
        id: "drift-uncertainty",
        title: "Deriva acumulada",
        decision: "aumentar-incertidumbre-con-drift",
        recommendation: "Trate cada tick sin sincronización como más incertidumbre antes de ordenar o aceptar timestamps."
      }
    ];
  }

  if (raw.mode === "skew") {
    return [
      {
        id: "physical-ordering",
        title: "Ordenamiento por tiempo físico",
        decision: raw.clientOrderInvertsActualOrder ? "no-confiar-orden-total" : "orden-compatible-en-esta-muestra",
        recommendation: "No infiera orden total solo con timestamps físicos cuando hay offsets entre nodos."
      }
    ];
  }

  return [
    {
      id: "timestamp-tolerance",
      title: "Política de tolerancia",
      decision: "aceptar-solo-dentro-de-ventana",
      recommendation: "Separe eventos aceptados, rechazados y pendientes para que el estado operacional no oculte incertidumbre."
    }
  ];
}

function createLearningContract(raw) {
  if (raw.mode === "normal") {
    return {
      objective: "Distinguir metadatos de eventos basados en wall-clock de mediciones de duración transcurrida basadas en monotonic time.",
      keyMetrics: presentMetrics([
        keyMetric("Duración wall-clock", raw.wallClock.wallClockDurationMs, "ms", "Duración medida después de un salto de wall-clock."),
        keyMetric("Duración monotonic time", raw.wallClock.monotonicDurationMs, "ms", "Duración medida con una fuente monotonic time."),
        keyMetric("Eventos rechazados", raw.tolerance.rejected, "eventos", "Eventos fuera de la ventana de tolerancia en la muestra base.")
      ]),
      checklist: [
        "Compare duraciones wall-clock y monotonic antes de usar una fuente de reloj para tiempo transcurrido.",
        "Verifique que cada evento incluya suficientes metadatos de skew para explicar decisiones de tolerancia."
      ],
      takeaway: "Use tiempo físico como metadatos de eventos, no como fuente perfecta de duración u ordenamiento."
    };
  }

  if (raw.mode === "skew") {
    return {
      objective: "Observar cómo relojes físicos con skew pueden hacer que el orden de timestamps reportado difiera del orden real.",
      keyMetrics: presentMetrics([
        keyMetric("Orden invertido", raw.clientOrderInvertsActualOrder ? "sí" : "no", "decisión", "Indica si los timestamps reportados por clientes invierten el orden real."),
        keyMetric("Cantidad de eventos", raw.events.length, "eventos", "Cantidad de eventos comparados en el ejercicio de ordenamiento.")
      ]),
      checklist: [
        "Compare el orden recibido por el servidor con el orden de timestamps reportado por clientes.",
        "Identifique qué offsets de reloj vuelven inseguro el ordenamiento por tiempo físico."
      ],
      takeaway: "Los timestamps físicos necesitan manejo de incertidumbre antes de respaldar afirmaciones de ordenamiento."
    };
  }

  if (raw.mode === "drift") {
    return {
      objective: "Observar cómo el drift local de reloj aumenta el error de timestamp entre puntos de sincronización.",
      keyMetrics: presentMetrics([
        keyMetric("Drift por tick", raw.driftPerTickMs, "ms", "Skew adicional que aparece en cada tick."),
        keyMetric("Skew final", raw.finalClockSkewMs, "ms", "Skew de reloj al final de la línea de tiempo de drift."),
        keyMetric("Crecimiento total del error", raw.totalErrorGrowthMs, "ms", "Error adicional acumulado después del offset inicial.")
      ]),
      checklist: [
        "Siga cómo cada tick incrementa el skew después del offset inicial.",
        "Decida cuándo el error acumulado exigiría una nueva muestra de sincronización."
      ],
      takeaway: "La sincronización de relojes es temporal; el drift convierte datos de sincronización antiguos en incertidumbre creciente."
    };
  }

  return {
    objective: "Aplicar una ventana de tolerancia explícita antes de aceptar timestamps físicos de clientes.",
    keyMetrics: presentMetrics([
      keyMetric("Ventana de tolerancia", raw.thresholdMs, "ms", "Skew absoluto máximo aceptado."),
      keyMetric("Eventos aceptados", raw.accepted, "eventos", "Eventos dentro del presupuesto de tolerancia."),
      keyMetric("Eventos rechazados", raw.rejected, "eventos", "Eventos fuera del presupuesto de tolerancia.")
    ]),
    checklist: [
      "Verifique el skew de cada evento contra la ventana de tolerancia configurada.",
      "Explique por qué los timestamps rechazados no deben sobrescribir silenciosamente estado confiable del servidor."
    ],
    takeaway: "La aceptación de timestamps es una decisión de política, no una decisión de confianza ciega."
  };
}

function runPhysicalTimeObservabilityLab(mode = "normal") {
  if (!PHYSICAL_TIME_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`physical-time mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  const raw = runPhysicalTimeLab({ mode });
  const observations = createObservations(raw);
  return {
    labId: "physical-time",
    session: 21,
    mode,
    title: "Sesión 21: tiempo físico, skew, drift y límites de sincronización",
    summary: raw.description,
    inputs: { mode },
    metrics: createMetrics(raw),
    observations,
    decisions: createDecisions(raw),
    timeline: createTimeline(raw),
    recommendations: observations.slice(1),
    learning: createLearningContract(raw),
    raw
  };
}

module.exports = {
  listPhysicalTimeModes,
  runPhysicalTimeObservabilityLab
};
