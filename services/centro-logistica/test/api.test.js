const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createApp } = require("../src/server");
const repository = require("../src/repository");
const { calculateBackoffDelay } = require("../src/route-planner-client");

let server;
let baseUrl;
let plannerServer;
let plannerBaseUrl;

async function listen(app) {
  const runningServer = app.listen(0);
  await new Promise((resolve) => runningServer.once("listening", resolve));
  const { port } = runningServer.address();
  return { runningServer, url: `http://127.0.0.1:${port}` };
}

function createPlannerStub(handler) {
  const app = express();
  app.use(express.json());
  app.post("/api/v1/routes/plan", handler);
  return app;
}

function plannerSuccessResponse(req) {
  return {
    algorithm: "nearest-neighbor-manhattan",
    total_stops: req.body.deliveries.length,
    route: req.body.deliveries.map((delivery, index) => ({
      stop: index + 1,
      delivery_id: delivery.id,
      location: delivery.location,
      segment_distance: 1
    }))
  };
}

test.before(async () => {
  const planner = await listen(createPlannerStub((req, res) => res.json(plannerSuccessResponse(req))));
  plannerServer = planner.runningServer;
  plannerBaseUrl = planner.url;

  const app = createApp({ routePlanner: { baseUrl: plannerBaseUrl, timeoutMs: 100, retries: 1, backoffMs: 1 } });
  const logistics = await listen(app);
  server = logistics.runningServer;
  baseUrl = logistics.url;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await new Promise((resolve, reject) => plannerServer.close((err) => (err ? reject(err) : resolve())));
});

test.beforeEach(() => {
  repository.resetOrders();
});

test("healthcheck responde ok", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "centro-logistica" });
});

test("crea orden y la lista", async () => {
  const payload = {
    pickup_location: { latitude: -34.6037, longitude: -58.3816 },
    destination: { latitude: -34.6158, longitude: -58.4333 }
  };

  const createResponse = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(createResponse.status, 201);
  const body = await createResponse.json();
  assert.equal(typeof body.id, "string");
  assert.deepEqual(body.pickup_location, payload.pickup_location);
  assert.deepEqual(body.destination, payload.destination);
  assert.equal(body.status, "pendiente");
  assert.equal(body.route_planner_attempts, 1);
  assert.equal(body.route_plan.total_stops, 1);
  assert.equal(body.route_plan.route[0].delivery_id, body.id);

  const listResponse = await fetch(`${baseUrl}/api/v1/orders`);
  assert.equal(listResponse.status, 200);
  const orders = await listResponse.json();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "pendiente");
});

test("genera correlation id si falta y lo devuelve en la respuesta", async () => {
  const response = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pickup_location: { latitude: -34.6037, longitude: -58.3816 },
      destination: { latitude: -34.6158, longitude: -58.4333 }
    })
  });

  assert.equal(response.status, 201);
  assert.match(response.headers.get("x-correlation-id"), /^[0-9a-f-]{36}$/i);
});

test("propaga correlation id e idempotency key al planificador-rutas", async () => {
  let observedHeaders;
  const observedPlanner = await listen(createPlannerStub((req, res) => {
    observedHeaders = {
      correlationId: req.get("X-Correlation-Id"),
      idempotencyKey: req.get("Idempotency-Key")
    };
    res.json(plannerSuccessResponse(req));
  }));

  const observedApp = createApp({
    routePlanner: {
      baseUrl: observedPlanner.url,
      timeoutMs: 50,
      retries: 0,
      backoffMs: 1
    }
  });
  const observedServer = await listen(observedApp);

  try {
    const response = await fetch(`${observedServer.url}/api/v1/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "corr-pc02-001",
        "idempotency-key": "order-intent-pc02-001"
      },
      body: JSON.stringify({
        pickup_location: { latitude: -34.6037, longitude: -58.3816 },
        destination: { latitude: -34.6158, longitude: -58.4333 }
      })
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("x-correlation-id"), "corr-pc02-001");
    assert.deepEqual(observedHeaders, {
      correlationId: "corr-pc02-001",
      idempotencyKey: "order-intent-pc02-001"
    });
  } finally {
    await new Promise((resolve, reject) => observedServer.runningServer.close((err) => (err ? reject(err) : resolve())));
    await new Promise((resolve, reject) => observedPlanner.runningServer.close((err) => (err ? reject(err) : resolve())));
  }
});

test("valida payload incompleto", async () => {
  const response = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pickup_location: { latitude: -34.6037, longitude: -58.3816 } })
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).detail, "destination inválido");
});

test("reintenta con backoff cuando planificador-rutas excede timeout", async () => {
  let attempts = 0;
  let observedBackoff = 0;
  const slowPlanner = await listen(createPlannerStub(async (req, res) => {
    attempts += 1;

    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    res.json(plannerSuccessResponse(req));
  }));

  const retryApp = createApp({
    routePlanner: {
      baseUrl: slowPlanner.url,
      timeoutMs: 20,
      retries: 1,
      backoffMs: 7,
      randomFn: () => 0,
      sleepFn: async (ms) => {
        observedBackoff += ms;
      }
    }
  });
  const retryServer = await listen(retryApp);

  try {
    const response = await fetch(`${retryServer.url}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pickup_location: { latitude: -34.6037, longitude: -58.3816 },
        destination: { latitude: -34.6158, longitude: -58.4333 }
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.route_planner_attempts, 2);
    assert.equal(attempts, 2);
    assert.equal(observedBackoff, 7);
  } finally {
    await new Promise((resolve, reject) => retryServer.runningServer.close((err) => (err ? reject(err) : resolve())));
    await new Promise((resolve, reject) => slowPlanner.runningServer.close((err) => (err ? reject(err) : resolve())));
  }
});

test("calcula backoff exponencial con jitter determinista", () => {
  assert.equal(calculateBackoffDelay(1, 10, () => 0), 10);
  assert.equal(calculateBackoffDelay(2, 10, () => 0.5), 25);
  assert.equal(calculateBackoffDelay(3, 10, () => 0.99), 49);
});

test("no persiste orden cuando planificador-rutas falla definitivamente", async () => {
  let attempts = 0;
  const failingPlanner = await listen(createPlannerStub((_req, res) => {
    attempts += 1;
    res.status(503).json({ detail: "planificador no disponible" });
  }));

  const failingApp = createApp({
    routePlanner: {
      baseUrl: failingPlanner.url,
      timeoutMs: 20,
      retries: 2,
      backoffMs: 1,
      sleepFn: async () => {}
    }
  });
  const failingServer = await listen(failingApp);

  try {
    const createResponse = await fetch(`${failingServer.url}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pickup_location: { latitude: -34.6037, longitude: -58.3816 },
        destination: { latitude: -34.6158, longitude: -58.4333 }
      })
    });

    assert.equal(createResponse.status, 503);
    assert.equal((await createResponse.json()).attempts, 3);
    assert.equal(attempts, 3);

    const listResponse = await fetch(`${failingServer.url}/api/v1/orders`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), []);
  } finally {
    await new Promise((resolve, reject) => failingServer.runningServer.close((err) => (err ? reject(err) : resolve())));
    await new Promise((resolve, reject) => failingPlanner.runningServer.close((err) => (err ? reject(err) : resolve())));
  }
});

test("no reintenta ni persiste orden cuando planificador-rutas rechaza zona inválida", async () => {
  let attempts = 0;
  const invalidZonePlanner = await listen(createPlannerStub((_req, res) => {
    attempts += 1;
    res.status(422).json({ detail: "zona inválida" });
  }));

  const invalidZoneApp = createApp({
    routePlanner: {
      baseUrl: invalidZonePlanner.url,
      timeoutMs: 20,
      retries: 2,
      backoffMs: 1,
      sleepFn: async () => {}
    }
  });
  const invalidZoneServer = await listen(invalidZoneApp);

  try {
    const createResponse = await fetch(`${invalidZoneServer.url}/api/v1/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pickup_location: { latitude: -34.6037, longitude: -58.3816 },
        destination: { latitude: -34.6158, longitude: -58.4333 }
      })
    });

    assert.equal(createResponse.status, 422);
    assert.equal((await createResponse.json()).attempts, 1);
    assert.equal(attempts, 1);

    const listResponse = await fetch(`${invalidZoneServer.url}/api/v1/orders`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), []);
  } finally {
    await new Promise((resolve, reject) => invalidZoneServer.runningServer.close((err) => (err ? reject(err) : resolve())));
    await new Promise((resolve, reject) => invalidZonePlanner.runningServer.close((err) => (err ? reject(err) : resolve())));
  }
});

test("idempotency-key evita duplicar una orden repetida", async () => {
  const payload = {
    pickup_location: { latitude: -34.6037, longitude: -58.3816 },
    destination: { latitude: -34.6158, longitude: -58.4333 }
  };
  const headers = { "content-type": "application/json", "idempotency-key": "orden-demo-001" };

  const firstResponse = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const secondResponse = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  assert.equal(firstResponse.status, 201);
  assert.equal(secondResponse.status, 200);

  const first = await firstResponse.json();
  const second = await secondResponse.json();
  assert.equal(second.id, first.id);
  assert.equal(second.idempotent_replay, true);

  const listResponse = await fetch(`${baseUrl}/api/v1/orders`);
  const orders = await listResponse.json();
  assert.equal(orders.length, 1);
});
