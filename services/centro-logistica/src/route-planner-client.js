const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 50;
const DEFAULT_BASE_URL = "http://planificador-rutas:8000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelay(attempt, backoffMs, randomFn = Math.random) {
  const exponentialDelay = backoffMs * (2 ** (attempt - 1));
  const jitter = Math.floor(randomFn() * backoffMs);
  return exponentialDelay + jitter;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getPlannerConfig(overrides = {}) {
  return {
    baseUrl: overrides.baseUrl || process.env.PLANIFICADOR_RUTAS_URL || DEFAULT_BASE_URL,
    timeoutMs: parsePositiveInteger(overrides.timeoutMs ?? process.env.ROUTE_PLANNER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retries: parsePositiveInteger(overrides.retries ?? process.env.ROUTE_PLANNER_RETRIES, DEFAULT_RETRIES),
    backoffMs: parsePositiveInteger(overrides.backoffMs ?? process.env.ROUTE_PLANNER_BACKOFF_MS, DEFAULT_BACKOFF_MS),
    randomFn: overrides.randomFn || Math.random,
    sleepFn: overrides.sleepFn || sleep
  };
}

function toPlannerPayload(order) {
  return {
    origin: {
      x: order.pickup_location.longitude,
      y: order.pickup_location.latitude
    },
    deliveries: [
      {
        id: order.id,
        location: {
          x: order.destination.longitude,
          y: order.destination.latitude
        }
      }
    ]
  };
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function buildPlannerError(message, metadata = {}) {
  const error = new Error(message);
  error.metadata = metadata;
  return error;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function planRouteForOrder(order, configOverrides = {}) {
  const config = getPlannerConfig(configOverrides);
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/routes/plan`;
  const maxAttempts = config.retries + 1;
  const errors = [];
  const headers = { "content-type": "application/json" };

  if (configOverrides.correlationId) {
    headers["x-correlation-id"] = configOverrides.correlationId;
  }

  if (configOverrides.idempotencyKey) {
    headers["idempotency-key"] = configOverrides.idempotencyKey;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(toPlannerPayload(order))
        },
        config.timeoutMs
      );

      if (response.ok) {
        return {
          plan: await response.json(),
          attempts: attempt
        };
      }

      const detail = await response.text();
      errors.push({ attempt, status: response.status, detail });

      if (!isRetryableStatus(response.status)) {
        throw buildPlannerError("planificador-rutas rechazó la solicitud", {
          attempts: attempt,
          errors,
          retryable: false,
          status: response.status,
          detail
        });
      }
    } catch (error) {
      if (error.metadata) {
        throw error;
      }

      errors.push({
        attempt,
        name: error.name,
        message: error.message
      });

      if (attempt === maxAttempts) {
        throw buildPlannerError("no se pudo obtener ruta desde planificador-rutas", {
          attempts: attempt,
          errors,
          retryable: true
        });
      }
    }

    if (attempt < maxAttempts) {
      await config.sleepFn(calculateBackoffDelay(attempt, config.backoffMs, config.randomFn));
    }
  }

  throw buildPlannerError("no se pudo obtener ruta desde planificador-rutas", {
    attempts: maxAttempts,
    errors,
    retryable: true
  });
}

module.exports = {
  calculateBackoffDelay,
  getPlannerConfig,
  planRouteForOrder,
  toPlannerPayload
};
