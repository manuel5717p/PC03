#!/usr/bin/env node

const BASE_TIME_MS = Date.UTC(2026, 5, 4, 15, 0, 0);

const PHYSICAL_TIME_PRESETS = {
  normal: {
    description: "Relojes base con skew pequeño dentro de la tolerancia",
    offsetsMs: [0, 15, -10]
  },
  skew: {
    description: "Los relojes de cliente difieren lo suficiente como para invertir el orden reportado",
    offsetsMs: [120, -90, 20]
  },
  drift: {
    description: "Un nodo adelanta su reloj en cada tick",
    startOffsetMs: 5,
    driftPerTickMs: 12,
    ticks: 6
  },
  tolerance: {
    description: "El servidor acepta timestamps solo dentro de una ventana de skew",
    thresholdMs: 100,
    offsetsMs: [20, -85, 140, -160]
  }
};

function formatIso(ms) {
  return new Date(ms).toISOString();
}

function createPhysicalTimeEvent(index, options = {}) {
  const actualOffsetMs = options.actualOffsetMs ?? index * 100;
  const serverReceivedAtMs = (options.baseTimeMs ?? BASE_TIME_MS) + actualOffsetMs;
  const clockOffsetMs = options.clockOffsetMs ?? 0;
  const clientReportedAtMs = serverReceivedAtMs + clockOffsetMs;
  const thresholdMs = options.thresholdMs ?? 100;
  const clockSkewMs = clientReportedAtMs - serverReceivedAtMs;

  return {
    eventId: `evt-physical-${String(index + 1).padStart(3, "0")}`,
    correlationId: options.correlationId ?? "corr-session-21-physical-time",
    nodeId: options.nodeId ?? `drone-${String(index + 1).padStart(3, "0")}`,
    actualOrder: index + 1,
    actualOccurredAtMs: serverReceivedAtMs,
    clientReportedAtMs,
    serverReceivedAtMs,
    clockSkewMs,
    acceptedWithinTolerance: Math.abs(clockSkewMs) <= thresholdMs,
    clientReportedAt: formatIso(clientReportedAtMs),
    serverReceivedAt: formatIso(serverReceivedAtMs)
  };
}

function createEventsWithOffsets(options = {}) {
  const offsetsMs = options.offsetsMs ?? PHYSICAL_TIME_PRESETS.normal.offsetsMs;
  return offsetsMs.map((clockOffsetMs, index) =>
    createPhysicalTimeEvent(index, {
      ...options,
      clockOffsetMs,
      nodeId: `node-${String(index + 1).padStart(2, "0")}`
    })
  );
}

function sortByClientReportedAt(events) {
  return [...events].sort((left, right) => left.clientReportedAtMs - right.clientReportedAtMs);
}

function sortByServerReceivedAt(events) {
  return [...events].sort((left, right) => left.serverReceivedAtMs - right.serverReceivedAtMs);
}

function simulateWallClockVsMonotonic(options = {}) {
  const startWallClockMs = options.startWallClockMs ?? BASE_TIME_MS;
  const monotonicStartMs = options.monotonicStartMs ?? 1_000;
  const realDurationMs = options.realDurationMs ?? 250;
  const wallClockJumpMs = options.wallClockJumpMs ?? -600;

  const endWallClockMs = startWallClockMs + realDurationMs + wallClockJumpMs;
  const monotonicEndMs = monotonicStartMs + realDurationMs;

  return {
    realDurationMs,
    wallClockJumpMs,
    wallClockDurationMs: endWallClockMs - startWallClockMs,
    monotonicDurationMs: monotonicEndMs - monotonicStartMs,
    startWallClock: formatIso(startWallClockMs),
    endWallClock: formatIso(endWallClockMs)
  };
}

function simulateSkew(options = {}) {
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.skew.offsetsMs,
    thresholdMs: options.thresholdMs
  });
  const actualOrder = sortByServerReceivedAt(events).map((event) => event.eventId);
  const clientReportedOrder = sortByClientReportedAt(events).map((event) => event.eventId);

  return {
    mode: "skew",
    description: PHYSICAL_TIME_PRESETS.skew.description,
    events,
    actualOrder,
    clientReportedOrder,
    clientOrderInvertsActualOrder: actualOrder.join("|") !== clientReportedOrder.join("|")
  };
}

function simulateDrift(options = {}) {
  const ticks = options.ticks ?? PHYSICAL_TIME_PRESETS.drift.ticks;
  const startOffsetMs = options.startOffsetMs ?? PHYSICAL_TIME_PRESETS.drift.startOffsetMs;
  const driftPerTickMs = options.driftPerTickMs ?? PHYSICAL_TIME_PRESETS.drift.driftPerTickMs;

  const timeline = Array.from({ length: ticks }, (_value, index) => {
    const clockSkewMs = startOffsetMs + index * driftPerTickMs;
    const serverReceivedAtMs = BASE_TIME_MS + index * 1_000;
    return {
      tick: index + 1,
      nodeId: "node-drifting-clock",
      serverReceivedAtMs,
      clientReportedAtMs: serverReceivedAtMs + clockSkewMs,
      clockSkewMs,
      errorGrowthMs: clockSkewMs - startOffsetMs,
      serverReceivedAt: formatIso(serverReceivedAtMs),
      clientReportedAt: formatIso(serverReceivedAtMs + clockSkewMs)
    };
  });

  return {
    mode: "drift",
    description: PHYSICAL_TIME_PRESETS.drift.description,
    startOffsetMs,
    driftPerTickMs,
    ticks,
    timeline,
    finalClockSkewMs: timeline[timeline.length - 1].clockSkewMs,
    totalErrorGrowthMs: timeline[timeline.length - 1].errorGrowthMs
  };
}

function evaluateTolerance(events, thresholdMs) {
  return events.map((event) => ({
    ...event,
    acceptedWithinTolerance: Math.abs(event.clockSkewMs) <= thresholdMs
  }));
}

function simulateTolerance(options = {}) {
  const thresholdMs = options.thresholdMs ?? PHYSICAL_TIME_PRESETS.tolerance.thresholdMs;
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.tolerance.offsetsMs,
    thresholdMs
  });
  const evaluatedEvents = evaluateTolerance(events, thresholdMs);

  return {
    mode: "tolerance",
    description: PHYSICAL_TIME_PRESETS.tolerance.description,
    thresholdMs,
    events: evaluatedEvents,
    accepted: evaluatedEvents.filter((event) => event.acceptedWithinTolerance).length,
    rejected: evaluatedEvents.filter((event) => !event.acceptedWithinTolerance).length
  };
}

function simulateNormal(options = {}) {
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.normal.offsetsMs,
    thresholdMs: options.thresholdMs
  });
  return {
    mode: "normal",
    description: PHYSICAL_TIME_PRESETS.normal.description,
    wallClock: simulateWallClockVsMonotonic(options),
    events,
    tolerance: simulateTolerance({ thresholdMs: options.thresholdMs ?? 100, offsetsMs: events.map((event) => event.clockSkewMs) })
  };
}

function parseArgs(argv) {
  const options = { mode: "normal" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--skew") {
      options.mode = "skew";
    } else if (arg === "--drift") {
      options.mode = "drift";
    } else if (arg === "--tolerance") {
      options.mode = "tolerance";
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--threshold-ms=")) {
      options.thresholdMs = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--ticks=")) {
      options.ticks = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--drift-per-tick-ms=")) {
      options.driftPerTickMs = Number(arg.split("=")[1]);
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }

  return options;
}

function runPhysicalTimeLab(options = {}) {
  const mode = options.mode ?? "normal";
  if (mode === "normal") {
    return simulateNormal(options);
  }
  if (mode === "skew") {
    return simulateSkew(options);
  }
  if (mode === "drift") {
    return simulateDrift(options);
  }
  if (mode === "tolerance") {
    return simulateTolerance(options);
  }

  throw new Error(`physical time mode '${mode}' is not supported. Use one of: normal, skew, drift, tolerance`);
}

function printWallClockSection(report) {
  console.log("Wall-clock vs duración monotónica");
  console.log(`- Duración real: ${report.realDurationMs} ms`);
  console.log(`- Salto de wall-clock: ${report.wallClockJumpMs} ms`);
  console.log(`- Duración medida con wall-clock: ${report.wallClockDurationMs} ms`);
  console.log(`- Duración medida con reloj monotónico: ${report.monotonicDurationMs} ms`);
  console.log("Interpretación: use timestamps de wall-clock como metadatos humanos/de evento, no para medir duración transcurrida.");
}

function printEvents(events) {
  events.forEach((event) => {
    console.log(
      `- ${event.eventId} ${event.nodeId}: clientReportedAt=${event.clientReportedAt} serverReceivedAt=${event.serverReceivedAt} skew=${event.clockSkewMs}ms accepted=${event.acceptedWithinTolerance}`
    );
  });
}

function printPhysicalTimeReport(report) {
  console.log(`Laboratorio de tiempo físico: ${report.mode}`);
  console.log(`Escenario: ${report.description}`);

  if (report.wallClock) {
    printWallClockSection(report.wallClock);
    console.log("Metadatos de eventos con offsets pequeños");
    printEvents(report.events);
    console.log("Interpretación: incluso los relojes saludables tienen offset; conserve metadatos de skew en lugar de tratar los timestamps como perfectos.");
    return;
  }

  if (report.mode === "skew") {
    console.log("Eventos por orden real observado por el servidor:");
    console.log(`- ${report.actualOrder.join(" -> ")}`);
    console.log("Eventos por clientReportedAt:");
    console.log(`- ${report.clientReportedOrder.join(" -> ")}`);
    printEvents(report.events);
    console.log(
      `Interpretación: clientReportedAt ${report.clientOrderInvertsActualOrder ? "invierte" : "no invierte"} el orden real. Los timestamps físicos por sí solos no demuestran orden global.`
    );
    return;
  }

  if (report.mode === "drift") {
    console.log(`Offset inicial: ${report.startOffsetMs} ms`);
    console.log(`Drift por tick: ${report.driftPerTickMs} ms`);
    report.timeline.forEach((entry) => {
      console.log(
        `- tick ${entry.tick}: clientReportedAt=${entry.clientReportedAt} serverReceivedAt=${entry.serverReceivedAt} skew=${entry.clockSkewMs}ms errorGrowth=${entry.errorGrowthMs}ms`
      );
    });
    console.log(`Skew final: ${report.finalClockSkewMs} ms`);
    console.log("Interpretación: la sincronización es temporal; el drift hace crecer el error entre puntos de sincronización.");
    return;
  }

  if (report.mode === "tolerance") {
    console.log(`Ventana de tolerancia: +/- ${report.thresholdMs} ms`);
    printEvents(report.events);
    console.log(`Aceptados: ${report.accepted}`);
    console.log(`Rechazados: ${report.rejected}`);
    console.log("Interpretación: los timestamps de cliente pueden ayudar, pero solo dentro de ventanas de tolerancia explícitas y con validación del servidor.");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runPhysicalTimeLab(options);
  printPhysicalTimeReport(report);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  BASE_TIME_MS,
  createEventsWithOffsets,
  createPhysicalTimeEvent,
  evaluateTolerance,
  parseArgs,
  runPhysicalTimeLab,
  simulateDrift,
  simulateNormal,
  simulateSkew,
  simulateTolerance,
  simulateWallClockVsMonotonic,
  sortByClientReportedAt,
  sortByServerReceivedAt
};
