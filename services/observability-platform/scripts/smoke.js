const expectedChecks = [
  {
    path: "/health",
    validate: (body) => JSON.parse(body).service === "observability-platform"
  },
  {
    path: "/api/labs",
    validate: (body) => {
      const labs = JSON.parse(body).labs;
      return labs.some((lab) => lab.id === "physical-time" && lab.session === 21) && labs.some((lab) => lab.id === "clock-sync" && lab.session === 22) && labs.some((lab) => lab.id === "lamport-ordering" && lab.session === 23) && labs.some((lab) => lab.id === "vector-clocks" && lab.session === 24) && labs.some((lab) => lab.id === "mutual-exclusion" && lab.session === 25) && labs.some((lab) => lab.id === "distributed-locks" && lab.session === 26) && labs.some((lab) => lab.id === "leader-election" && lab.session === 27) && labs.some((lab) => lab.id === "distributed-coordination" && lab.session === 28) && labs.some((lab) => lab.id === "coordination-integration" && lab.session === 29);
    }
  },
  {
    path: "/api/labs/physical-time/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "drift")
  },
  {
    path: "/api/labs/physical-time/run?mode=drift",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "physical-time" && payload.session === 21 && payload.mode === "drift";
    }
  },
  {
    path: "/api/labs/clock-sync/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "scenario-analysis")
  },
  {
    path: "/api/labs/clock-sync/run?mode=scenario-analysis",
    validate: (body) => JSON.parse(body).mode === "scenario-analysis"
  },
  {
    path: "/api/labs/lamport-ordering/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "causal-chain")
  },
  {
    path: "/api/labs/lamport-ordering/run?mode=causal-chain",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "lamport-ordering" && payload.session === 23 && payload.mode === "causal-chain";
    }
  },
  {
    path: "/api/labs/vector-clocks/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "merge-and-conflict")
  },
  {
    path: "/api/labs/vector-clocks/run?mode=merge-and-conflict",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "vector-clocks" && payload.session === 24 && payload.mode === "merge-and-conflict" && payload.metrics.conflictDetected === true;
    }
  },
  {
    path: "/api/labs/mutual-exclusion/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "critical-section-safety")
  },
  {
    path: "/api/labs/mutual-exclusion/run?mode=delay-and-reorder",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "mutual-exclusion" && payload.session === 25 && payload.mode === "delay-and-reorder" && payload.evidence.safetyHolds === true;
    }
  },
  {
    path: "/api/labs/distributed-locks/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "stale-owner-and-fencing-warning")
  },
  {
    path: "/api/labs/distributed-locks/run?mode=stale-owner-and-fencing-warning",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "distributed-locks" && payload.session === 26 && payload.mode === "stale-owner-and-fencing-warning" && payload.metrics.staleOwnerRejected === true;
    }
  },
  {
    path: "/api/labs/leader-election/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "leader-failure-and-reelection")
  },
  {
    path: "/api/labs/leader-election/run?mode=leader-failure-and-reelection",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "leader-election" && payload.session === 27 && payload.mode === "leader-failure-and-reelection" && payload.metrics.leaderChanges === 1;
    }
  },
  {
    path: "/api/labs/distributed-coordination/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "degraded-compensation")
  },
  {
    path: "/api/labs/distributed-coordination/run?mode=degraded-compensation",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "distributed-coordination" && payload.session === 28 && payload.mode === "degraded-compensation" && payload.metrics.compensationApplied === true;
    }
  },
  {
    path: "/api/labs/coordination-integration/modes",
    validate: (body) => JSON.parse(body).modes.some((mode) => mode.id === "suspected-leader-compensation")
  },
  {
    path: "/api/labs/coordination-integration/run?mode=suspected-leader-compensation",
    validate: (body) => {
      const payload = JSON.parse(body);
      return payload.labId === "coordination-integration" && payload.session === 29 && payload.mode === "suspected-leader-compensation" && payload.evidence.decision === "compensated";
    }
  },
  {
    path: "/",
    validate: (body) => body.includes("AURA Observability Platform")
  },
  {
    path: "/app.js",
    validate: (body) => body.includes("loadModes")
  }
];

const baseUrl = process.env.OBSERVABILITY_BASE_URL ?? "http://localhost:8010";
const retries = Number(process.env.SMOKE_RETRIES ?? 10);
const retryDelayMs = Number(process.env.SMOKE_RETRY_DELAY_MS ?? 500);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function checkEndpoint({ path, validate }) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(new URL(path, baseUrl));
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`${path} returned HTTP ${response.status}`);
      }

      if (!validate(body)) {
        throw new Error(`${path} returned an unexpected payload`);
      }

      console.log(`ok ${path}`);
      return;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await wait(retryDelayMs);
      }
    }
  }

  throw lastError;
}

async function main() {
  for (const check of expectedChecks) {
    await checkEndpoint(check);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
