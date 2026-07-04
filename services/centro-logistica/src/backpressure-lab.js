#!/usr/bin/env node

const { createBoundedWorkQueue } = require("./lab-work-queue");

const QUEUE_PRESSURE_PRESETS = {
  normal: {
    incomingJobs: 4,
    maxQueued: 8,
    workerCapacity: 4,
    maxAttempts: 2,
    acceptEvery: 1,
    failFirstNotification: false
  },
  saturated: {
    incomingJobs: 10,
    maxQueued: 4,
    workerCapacity: 2,
    maxAttempts: 2,
    acceptEvery: 1,
    failFirstNotification: false
  },
  controlled: {
    incomingJobs: 10,
    maxQueued: 6,
    workerCapacity: 6,
    maxAttempts: 2,
    acceptEvery: 2,
    failFirstNotification: true
  }
};

function assertKnownQueuePressureMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(QUEUE_PRESSURE_PRESETS, mode)) {
    const supportedModes = Object.keys(QUEUE_PRESSURE_PRESETS).join(", ");
    throw new Error(`queue pressure mode '${mode}' is not supported. Use one of: ${supportedModes}`);
  }
}

function createQueuePressurePlan(options = {}) {
  const mode = options.mode ?? "normal";
  assertKnownQueuePressureMode(mode);
  const preset = QUEUE_PRESSURE_PRESETS[mode];
  return {
    mode,
    incomingJobs: options.incomingJobs ?? preset.incomingJobs,
    maxQueued: options.maxQueued ?? preset.maxQueued,
    workerCapacity: options.workerCapacity ?? preset.workerCapacity,
    maxAttempts: options.maxAttempts ?? preset.maxAttempts,
    acceptEvery: options.acceptEvery ?? preset.acceptEvery,
    failFirstNotification: options.failFirstNotification ?? preset.failFirstNotification
  };
}

async function runQueuePressureLab(options = {}) {
  const plan = createQueuePressurePlan(options);
  const queue = createBoundedWorkQueue({ maxQueued: plan.maxQueued, maxAttempts: plan.maxAttempts });
  const enqueueResults = [];
  const deferredJobs = [];
  let workerAttempts = 0;

  for (let index = 1; index <= plan.incomingJobs; index += 1) {
    const orderId = `order-${String(index).padStart(3, "0")}`;
    if (plan.acceptEvery > 1 && (index - 1) % plan.acceptEvery !== 0) {
      deferredJobs.push({ orderId, reason: "producer_rate_reduction" });
      continue;
    }

    enqueueResults.push(queue.enqueue("send-order-created-notification", {
      orderId,
      businessCriticality: "retryable-notification"
    }));
  }

  const firstPass = await queue.processBatch(async (item) => {
    workerAttempts += 1;
    if (plan.failFirstNotification && workerAttempts === 1) {
      throw new Error("simulated notification provider timeout");
    }
    return { sent: true, orderId: item.payload.orderId };
  }, plan.workerCapacity);

  const secondPass = plan.failFirstNotification
    ? await queue.processBatch(async (item) => {
        workerAttempts += 1;
        return { sent: true, orderId: item.payload.orderId };
      })
    : [];

  return {
    scenario: "bounded-work-queue-pressure",
    mode: plan.mode,
    businessRule: "Notifications may be retried or deferred, but legal audit events must not be silently dropped.",
    incomingJobs: plan.incomingJobs,
    enqueueResults,
    workerResults: [...firstPass, ...secondPass],
    deferredJobs,
    metrics: queue.getMetrics(),
    rejectedJobs: queue.getRejectedItems()
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--saturated") {
      options.mode = "saturated";
    } else if (arg === "--controlled") {
      options.mode = "controlled";
    } else if (arg.startsWith("--incoming-jobs=")) {
      options.incomingJobs = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--max-queued=")) {
      options.maxQueued = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--worker-capacity=")) {
      options.workerCapacity = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--accept-every=")) {
      options.acceptEvery = Number(arg.split("=")[1]);
    } else if (arg === "--fail-first-notification") {
      options.failFirstNotification = true;
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }
  return options;
}

function printReport(report) {
  console.log(`Queue pressure lab: ${report.mode}`);
  console.log(`Scenario: ${report.scenario}`);
  console.log(`Business rule: ${report.businessRule}`);
  console.log(`Incoming jobs: ${report.incomingJobs}`);
  console.log(`Queued accepted: ${report.metrics.enqueued}`);
  console.log(`Deferred by rate reduction: ${report.deferredJobs.length}`);
  console.log(`Rejected at capacity: ${report.metrics.rejected}`);
  console.log(`Processed: ${report.metrics.processed}`);
  console.log(`Retries queued: ${report.metrics.retried}`);
  console.log(`Backlog: ${report.metrics.queued}`);
  console.log(`Metrics: ${JSON.stringify(report.metrics)}`);
  console.log("Worker results:");
  report.workerResults.forEach((result, index) => {
    console.log(`- #${index + 1}: ${result.status} ${result.item?.id ?? ""}`.trim());
  });
}

function main() {
  runQueuePressureLab(parseArgs(process.argv.slice(2)))
    .then(printReport)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  createQueuePressurePlan,
  parseArgs,
  runQueuePressureLab
};
