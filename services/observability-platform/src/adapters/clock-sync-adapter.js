const { createClockSyncLabResult } = require("../../../monitor-telemetria/src/clock-sync-lab");

const CLOCK_SYNC_MODES = [
  {
    id: "normal",
    title: "Intercambio NTP simétrico",
    description: "Muestra cómo el intercambio de cuatro timestamps estima el offset cuando el delay es simétrico."
  },
  {
    id: "asymmetric-delay",
    title: "Retardo asimétrico",
    description: "Expone cómo el delay desigual sesga la estimación de offset."
  },
  {
    id: "correction-policy",
    title: "Política de corrección",
    description: "Compara corrección step contra slew y sus efectos sobre la continuidad del reloj."
  },
  {
    id: "stale-sync",
    title: "Sincronización envejecida",
    description: "Observa cómo la deriva degrada la confianza desde la última sincronización."
  },
  {
    id: "telemetry-impact",
    title: "Impacto en telemetría",
    description: "Evalúa cuándo los metadatos temporales alcanzan para ordenamiento, SLA y auditoría."
  },
  {
    id: "scenario-analysis",
    title: "Análisis de escenarios de sincronización",
    description: "Visualiza incertidumbre, decisiones y límites de causalidad de la Sesión 22."
  }
];

function listClockSyncModes() {
  return CLOCK_SYNC_MODES;
}

function keyMetric(label, value, unit, meaning) {
  return { label, value, unit, meaning };
}

function presentMetrics(metrics) {
  return metrics.filter((metric) => metric.value !== undefined && metric.value !== null);
}

function createLearningContract(result) {
  const { raw } = result;

  if (result.mode === "normal") {
    return {
      objective: "Entender cómo un intercambio de cuatro timestamps estima el offset del reloj cuando el delay de red es simétrico.",
      keyMetrics: presentMetrics([
        keyMetric("Offset estimado", raw.exchange?.estimatedOffsetMs, "ms", "Distancia aparente entre el reloj del cliente y el reloj del servidor."),
        keyMetric("Retardo ida y vuelta", raw.exchange?.roundTripDelayMs, "ms", "Tiempo de red observado por el intercambio después de descontar el procesamiento del servidor."),
        keyMetric("Sesgo de estimación", raw.exchange?.estimationBiasMs, "ms", "Diferencia entre el offset estimado y el offset real conocido en este laboratorio.")
      ]),
      checklist: [
        "Verifique que el offset estimado coincida con el offset real cuando los retardos cliente-servidor y servidor-cliente son iguales.",
        "Confirme que el retardo ida y vuelta excluya el procesamiento del servidor antes de confiar en el offset estimado."
      ],
      takeaway: "Con latencia simétrica, el offset estimado puede coincidir con el offset real en este escenario controlado."
    };
  }

  if (result.mode === "asymmetric-delay") {
    return {
      objective: "Observar cómo delays de ida y vuelta desiguales pueden interpretarse erróneamente como offset de reloj en una estimación estilo NTP.",
      keyMetrics: presentMetrics([
        keyMetric("Delay cliente-servidor", raw.exchange?.clientToServerDelayMs, "ms", "Delay de ida utilizado por el intercambio simulado."),
        keyMetric("Delay servidor-cliente", raw.exchange?.serverToClientDelayMs, "ms", "Delay de vuelta utilizado por el intercambio simulado."),
        keyMetric("Sesgo de estimación", raw.exchange?.estimationBiasMs, "ms", "Error de offset introducido por la ruta asimétrica.")
      ]),
      checklist: [
        "Compare los delays de ida y vuelta e identifique qué ruta genera el sesgo de offset.",
        "Verifique si el sesgo de estimación es suficiente para afectar decisiones posteriores basadas en tiempo físico."
      ],
      takeaway: "La sincronización de relojes reduce incertidumbre, pero las redes asimétricas todavía pueden sesgar decisiones basadas en tiempo físico."
    };
  }

  if (result.mode === "correction-policy") {
    return {
      objective: "Comparar corrección step inmediata con corrección slew gradual y el compromiso operativo entre velocidad y continuidad.",
      keyMetrics: presentMetrics([
        keyMetric("Corrección step", raw.step?.appliedCorrectionMs, "ms", "Salto inmediato de reloj necesario para alcanzar el offset objetivo."),
        keyMetric("Corrección slew por tick", raw.slew?.correctionPerTickMs, "ms", "Corrección gradual aplicada en cada tick."),
        keyMetric("Ticks de slew", raw.slew?.ticks, "ticks", "Cantidad de incrementos utilizados por la corrección gradual.")
      ]),
      checklist: [
        "Decida si una corrección step inmediata rompería el ordenamiento por timestamps para esta carga.",
        "Use los ticks de slew y la corrección por tick para explicar cuánto tarda la convergencia sin un salto de reloj."
      ],
      takeaway: "Step converge de inmediato, pero puede crear saltos aparentes de tiempo; slew preserva continuidad a costa de una convergencia más lenta."
    };
  }

  if (result.mode === "stale-sync") {
    return {
      objective: "Entender por qué una muestra de sincronización antigua pierde confianza a medida que se acumula drift de reloj.",
      keyMetrics: presentMetrics([
        keyMetric("Edad de sincronización", raw.sync?.syncAgeMs, "ms", "Tiempo transcurrido desde la última estimación de offset."),
        keyMetric("Drift desde la última sincronización", raw.sync?.driftSinceLastSyncMs, "ms", "Incertidumbre adicional acumulada por drift local."),
        keyMetric("Confianza", raw.sync?.confidence === undefined ? undefined : Math.round(raw.sync.confidence * 100), "%", "Nivel de confianza después de comparar el error estimado con la tolerancia.")
      ]),
      checklist: [
        "Verifique si la edad de sincronización y el drift llevan el error estimado fuera del presupuesto de tolerancia.",
        "Use el valor de confianza para decidir si hace falta una nueva muestra de sincronización antes de actuar."
      ],
      takeaway: "La frescura de la sincronización forma parte de la corrección: los metadatos de sincronización envejecidos deben reducir la confianza antes de que los timestamps impulsen decisiones."
    };
  }

  if (result.mode === "telemetry-impact") {
    return {
      objective: "Conectar metadatos de clock-sync con decisiones de telemetría para ordenamiento, ventanas de SLA y líneas de tiempo de auditoría.",
      keyMetrics: presentMetrics([
        keyMetric("Error estimado", raw.telemetry?.estimatedErrorMs, "ms", "Margen de incertidumbre asociado al timestamp de telemetría."),
        keyMetric("Confianza", raw.telemetry?.confidence === undefined ? undefined : Math.round(raw.telemetry.confidence * 100), "%", "Confianza de sincronización usada por reglas posteriores de confiabilidad."),
        keyMetric("Confiable para ordenamiento", raw.telemetry ? (raw.telemetry.trustedForOrdering ? "sí" : "no") : undefined, "decisión", "Indica si este timestamp es suficientemente seguro para ordenar estado operacional.")
      ]),
      checklist: [
        "Compare el error estimado más el offset de reloj contra la tolerancia de ordenamiento antes de confiar en el orden de eventos.",
        "Verifique por separado si la confianza alcanza para ordenamiento, ventanas de SLA y líneas de tiempo de auditoría."
      ],
      takeaway: "Cada caso de uso de telemetría necesita una tolerancia explícita; un timestamp no debe recibir el mismo nivel de confianza para todas las decisiones."
    };
  }

  return {
    objective: "Practicar razonamiento a nivel de escenario cuando la incertidumbre de timestamps afecta causalidad, telemetría, auditoría y decisiones de SLA.",
    keyMetrics: presentMetrics([
      keyMetric("Ventana de incertidumbre", raw.lowBatteryVsMission?.estimatedErrorMs, "ms", "Margen de error alrededor de los eventos comparados."),
      keyMetric("Diferencia observada", raw.lowBatteryVsMission?.differenceMs, "ms", "Distancia entre los timestamps de ambos eventos antes de aplicar incertidumbre."),
      keyMetric("Pares de auditoría demasiado cercanos", raw.audit?.tooClosePairs.length, "pares", "Pares de eventos de auditoría que no pueden ordenarse totalmente solo con tiempo físico.")
    ]),
    checklist: [
      "Compare la diferencia observada entre eventos con la ventana de incertidumbre antes de declarar un orden causal.",
      "Inspeccione los pares de auditoría demasiado cercanos y exija metadatos de correlación cuando los timestamps físicos sean insuficientes."
    ],
    takeaway: "NTP ayuda a reducir ventanas temporales, pero la causalidad todavía requiere políticas conservadoras y metadatos de correlación."
  };
}

function runClockSyncLab(mode = "normal") {
  if (!CLOCK_SYNC_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`clock-sync mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  const result = createClockSyncLabResult({ mode });
  return {
    ...result,
    title: mode === "scenario-analysis" ? "Sesión 22: análisis de escenarios de sincronización" : "Sesión 22: laboratorio de sincronización de relojes",
    learning: createLearningContract(result)
  };
}

module.exports = {
  listClockSyncModes,
  runClockSyncLab
};
