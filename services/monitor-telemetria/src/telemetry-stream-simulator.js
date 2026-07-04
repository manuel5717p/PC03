#!/usr/bin/env node

const grpc = require("@grpc/grpc-js");
const { loadProto } = require("./server");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function buildTelemetryPacket(index, options = {}) {
  const droneNumber = (index % (options.droneCount ?? 5)) + 1;
  return {
    drone_id: `drone-${String(droneNumber).padStart(3, "0")}`,
    timestamp: {
      seconds: Math.floor((options.baseTimeMs ?? Date.UTC(2026, 4, 21, 20, 0, 0)) / 1000) + index,
      nanos: 0
    },
    location: {
      latitude: roundCoordinate(-34.6037 + index * 0.0001),
      longitude: roundCoordinate(-58.3816 - index * 0.0001)
    },
    battery_level: Math.max(5, 95 - index),
    status: index % 7 === 0 ? "returning" : "in_flight"
  };
}

function createTelemetryPlan(options = {}) {
  const mode = options.mode ?? "normal";
  const count = options.count ?? (mode === "concert" ? 250 : 5);
  const intervalMs = options.intervalMs ?? (mode === "concert" ? 0 : 1000);

  return {
    mode,
    count,
    intervalMs,
    packets: Array.from({ length: count }, (_value, index) => buildTelemetryPacket(index, options))
  };
}

const TELEMETRY_PRESSURE_PRESETS = {
  normal: {
    producedPerTick: 2,
    consumerCapacityPerTick: 3,
    ticks: 5,
    bufferCapacity: 10,
    strategy: "buffer"
  },
  saturated: {
    producedPerTick: 6,
    consumerCapacityPerTick: 2,
    ticks: 5,
    bufferCapacity: 8,
    strategy: "buffer"
  },
  controlled: {
    producedPerTick: 6,
    consumerCapacityPerTick: 2,
    ticks: 5,
    bufferCapacity: 8,
    strategy: "sample",
    sampleEvery: 3
  }
};

function assertKnownMode(mode, presets, labName) {
  if (!Object.prototype.hasOwnProperty.call(presets, mode)) {
    const supportedModes = Object.keys(presets).join(", ");
    throw new Error(`${labName} mode '${mode}' is not supported. Use one of: ${supportedModes}`);
  }
}

function createTelemetryPressurePlan(options = {}) {
  const mode = options.mode ?? "normal";
  assertKnownMode(mode, TELEMETRY_PRESSURE_PRESETS, "telemetry pressure");
  const preset = TELEMETRY_PRESSURE_PRESETS[mode];
  return {
    mode,
    producedPerTick: options.producedPerTick ?? preset.producedPerTick,
    consumerCapacityPerTick: options.consumerCapacityPerTick ?? preset.consumerCapacityPerTick,
    ticks: options.ticks ?? preset.ticks,
    bufferCapacity: options.bufferCapacity ?? preset.bufferCapacity,
    strategy: options.strategy ?? preset.strategy,
    sampleEvery: options.sampleEvery ?? preset.sampleEvery ?? 1
  };
}

function simulateTelemetryPressure(options = {}) {
  const plan = createTelemetryPressurePlan(options);
  const buffer = [];
  const timeline = [];
  let produced = 0;
  let accepted = 0;
  let processed = 0;
  let dropped = 0;
  let sampledOut = 0;
  let peakBuffered = 0;

  for (let tick = 1; tick <= plan.ticks; tick += 1) {
    let producedThisTick = 0;
    let acceptedThisTick = 0;
    let droppedThisTick = 0;
    let sampledThisTick = 0;

    for (let index = 0; index < plan.producedPerTick; index += 1) {
      produced += 1;
      producedThisTick += 1;

      if (plan.strategy === "sample" && (produced - 1) % plan.sampleEvery !== 0) {
        sampledOut += 1;
        sampledThisTick += 1;
        continue;
      }

      if (buffer.length >= plan.bufferCapacity) {
        dropped += 1;
        droppedThisTick += 1;
        continue;
      }

      buffer.push(buildTelemetryPacket(produced - 1, options));
      accepted += 1;
      acceptedThisTick += 1;
      peakBuffered = Math.max(peakBuffered, buffer.length);
    }

    const processCount = Math.min(plan.consumerCapacityPerTick, buffer.length);
    buffer.splice(0, processCount);
    processed += processCount;

    timeline.push({
      tick,
      produced: producedThisTick,
      accepted: acceptedThisTick,
      processed: processCount,
      buffered: buffer.length,
      dropped: droppedThisTick,
      sampledOut: sampledThisTick
    });
  }

  return {
    mode: plan.mode,
    strategy: plan.strategy,
    produced,
    accepted,
    processed,
    buffered: buffer.length,
    peakBuffered,
    dropped,
    sampledOut,
    lag: produced - processed - dropped - sampledOut,
    plan,
    timeline
  };
}

async function runLocalSimulation(options = {}) {
  const plan = createTelemetryPlan(options);
  const observed = [];

  for (const packet of plan.packets) {
    observed.push(packet);
    if (plan.intervalMs > 0 && options.skipDelay !== true) {
      await sleep(plan.intervalMs);
    }
  }

  return {
    mode: plan.mode,
    transport: "local-lab-simulation",
    packetsSent: observed.length,
    intervalMs: plan.intervalMs,
    firstPacket: observed[0] ?? null,
    lastPacket: observed[observed.length - 1] ?? null
  };
}

async function streamToGrpc(options = {}) {
  const plan = createTelemetryPlan(options);
  const target = options.target ?? "127.0.0.1:50051";
  const telemetryPackage = loadProto();
  const client = new telemetryPackage.TelemetryService(target, grpc.credentials.createInsecure());

  const ackPromise = new Promise((resolve, reject) => {
    const call = client.StreamTelemetry((error, ack) => {
      client.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(ack);
    });

    (async () => {
      for (const packet of plan.packets) {
        call.write(packet);
        if (plan.intervalMs > 0 && options.skipDelay !== true) {
          await sleep(plan.intervalMs);
        }
      }
      call.end();
    })().catch((error) => {
      call.destroy(error);
      reject(error);
    });
  });

  const ack = await ackPromise;
  return {
    mode: plan.mode,
    transport: "grpc-client-stream",
    target,
    packetsSent: plan.count,
    intervalMs: plan.intervalMs,
    ack
  };
}

function parseArgs(argv) {
  const options = { skipDelay: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--concert") {
      options.mode = "concert";
    } else if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--saturated") {
      options.mode = "saturated";
    } else if (arg === "--controlled") {
      options.mode = "controlled";
    } else if (arg === "--skip-delay") {
      options.skipDelay = true;
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--count=")) {
      options.count = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1];
    } else if (arg.startsWith("--produced-per-tick=")) {
      options.producedPerTick = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--consumer-capacity-per-tick=")) {
      options.consumerCapacityPerTick = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--ticks=")) {
      options.ticks = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--buffer-capacity=")) {
      options.bufferCapacity = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--strategy=")) {
      options.strategy = arg.split("=")[1];
    } else if (arg.startsWith("--sample-every=")) {
      options.sampleEvery = Number(arg.split("=")[1]);
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }

  return options;
}

function printReport(report) {
  console.log(`Telemetry simulator: ${report.mode}`);
  console.log(`Transport: ${report.transport}`);
  if (report.target) {
    console.log(`Target: ${report.target}`);
  }
  console.log(`Packets sent: ${report.packetsSent}`);
  console.log(`Interval ms: ${report.intervalMs}`);
  if (report.ack) {
    console.log(`Ack: ${JSON.stringify(report.ack)}`);
  }
  if (report.firstPacket) {
    console.log(`First packet: ${report.firstPacket.drone_id}`);
    console.log(`Last packet: ${report.lastPacket.drone_id}`);
  }
}

function printPressureReport(report) {
  console.log(`Telemetry pressure lab: ${report.mode}`);
  console.log(`Strategy: ${report.strategy}`);
  console.log(`Produced: ${report.produced}`);
  console.log(`Accepted into buffer: ${report.accepted}`);
  console.log(`Processed: ${report.processed}`);
  console.log(`Buffered backlog: ${report.buffered}`);
  console.log(`Peak buffered: ${report.peakBuffered}`);
  console.log(`Dropped: ${report.dropped}`);
  console.log(`Sampled out: ${report.sampledOut}`);
  console.log(`Lag: ${report.lag}`);
  console.log("Timeline:");
  report.timeline.forEach((entry) => {
    console.log(
      `- tick ${entry.tick}: produced=${entry.produced} accepted=${entry.accepted} processed=${entry.processed} buffered=${entry.buffered} dropped=${entry.dropped} sampled=${entry.sampledOut}`
    );
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = options.target
    ? await streamToGrpc(options)
    : await runLocalSimulation(options);
  printReport(report);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildTelemetryPacket,
  createTelemetryPlan,
  createTelemetryPressurePlan,
  runLocalSimulation,
  simulateTelemetryPressure,
  streamToGrpc,
  parseArgs,
  printPressureReport
};
